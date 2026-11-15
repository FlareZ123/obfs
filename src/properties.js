'use strict';

const {createHash} = require('node:crypto');
const {parse, walk, applyEdits, observesFunctionSource, staticString} = require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Collect every declared name, including names shadowed in inner scopes.
 * Requiring exactly one declaration of a tracked name is a deliberately strict
 * safety gate that avoids inventing a partial lexical resolver.
 * @param {AstNode} ast
 * @returns {Map<string,number>}
 */
function collectBindings(ast) {
  const counts = new Map();
  /** @param {AstNode|null|undefined} node */
  function pattern(node) {
    if (!node) return;
    if (node.type === 'Identifier') counts.set(node.name, (counts.get(node.name) || 0) + 1);
    else if (node.type === 'RestElement' || node.type === 'AssignmentPattern') pattern(node.argument || node.left);
    else if (node.type === 'ArrayPattern') for (const element of node.elements) pattern(element);
    else if (node.type === 'ObjectPattern') for (const property of node.properties) pattern(property.type === 'RestElement' ? property.argument : property.value);
  }
  walk(ast, node => {
    switch (node.type) {
      case 'VariableDeclarator': pattern(node.id); break;
      case 'FunctionDeclaration': case 'FunctionExpression':
        pattern(node.id);
        for (const param of node.params) pattern(param);
        break;
      case 'ArrowFunctionExpression': for (const param of node.params) pattern(param); break;
      case 'ClassDeclaration': case 'ClassExpression': pattern(node.id); break;
      case 'CatchClause': pattern(node.param); break;
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': pattern(node.local); break;
      default: break;
    }
  });
  return counts;
}

/**
 * Return a static, non-magic property name, or null if unknown.
 * @param {AstNode} node
 * @returns {string|null}
 */
function staticName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/**
 * A literal object key is safe to rewrite only when its computed expression
 * is a side-effect-free constant string. The surrounding computed brackets
 * stay intact when the interior expression is replaced with a quoted name.
 * @param {AstNode} property
 * @returns {string|null}
 */
function ownPropertyName(property) {
  return property.computed ? staticString(property.key) : staticName(property.key);
}

/**
 * Primitive literals and recursively literal-only arrays carry no receiver
 * binding and cannot infer a function name from the enclosing object key.
 * @param {AstNode} node
 * @returns {boolean}
 */
function isLiteralValue(node) {
  if(node.type==='Literal')return true;
  if(node.type==='ArrayExpression') {
    return node.elements.every((/** @type {AstNode|null} */ element)=>element && isLiteralValue(element));
  }
  // A nested plain object with static keys and recursively inert values does
  // not capture the enclosing owner's identity or invoke user code during
  // construction. Accesses to the nested object's own keys stay untouched.
  if(node.type==='ObjectExpression') {
    return node.properties.every((/** @type {AstNode} */ property)=>
      property.type==='Property' && property.kind==='init' &&
      !property.method && !property.shorthand &&
      ownPropertyName(property)!==null && isLiteralValue(property.value));
  }
  return false;
}

/**
 * Each simple binding's visible lexical region. A unique name alone cannot
 * prove that a same-spelled free reference outside the region is the binding.
 * Derived from Agent 2's lexical-containment counterexample and implementation.
 * @param {AstNode} ast
 * @returns {Map<string,AstNode>}
 */
function collectBindingScopes(ast) {
  /** @type {Map<string,AstNode>} */
  const scopes=new Map();
  const lexical=new Set(['Program','BlockStatement','StaticBlock','SwitchStatement',
    'ForStatement','ForInStatement','ForOfStatement','CatchClause']);
  /** @param {AstNode[]} ancestors @returns {AstNode} */
  function enclosing(ancestors) {
    return [...ancestors].reverse().find(node=>lexical.has(node.type)) || ast;
  }
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier') {
      scopes.set(node.id.name,enclosing(ancestors));
    } else if(node.type==='FunctionDeclaration') {
      if(node.id?.type==='Identifier') scopes.set(node.id.name,enclosing(ancestors));
      for(const param of node.params) if(param.type==='Identifier')scopes.set(param.name,node);
    } else if(node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression') {
      for(const param of node.params) if(param.type==='Identifier')scopes.set(param.name,node);
    } else if(/^Import(?:Default|Namespace)?Specifier$/.test(node.type) && node.local?.type==='Identifier') {
      scopes.set(node.local.name,ast);
    }
  });
  return scopes;
}

/**
 * Closed-world proof of safe uses of a candidate object and its aliases.
 * Recognizes const aliases, direct function parameters, and identity forwarding.
 * Rejects reflection, computed keys, escapes, ambiguous calls, and shadowing.
 * @param {AstNode} ast
 * @param {string} rootName
 * @param {Map<string,number>} bindings
 * @param {Map<string,number>} [importedIdentityFunctions] Verified direct ESM imports of immutable, pure identity functions.
 * @param {Map<string,number>} [importedConsumers] Verified imported functions that consume an object without returning an alias.
 * @returns {{aliases:Set<string>,members:AstNode[],patterns:AstNode[]}|null}
 */
function proveLocalObject(ast, rootName, bindings, importedIdentityFunctions=new Map(), importedConsumers=new Map()) {
  if(observesFunctionSource(ast)) return null;
  /** @type {Map<string,{node:AstNode,params:AstNode[],forwardIndex:number,external?:boolean,consumerIndex?:number}>} */
  const functions = new Map();
  /** @type {Map<string,AstNode[]>} */
  const calls = new Map();
  /** @type {AstNode[]} */
  const declarations = [];
  /** @type {{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[]}[]} */
  const identifiers = [];
  /** @type {WeakMap<AstNode,AstNode>} */
  const parents = new WeakMap();
  let dynamicScope = false;

  walk(ast, (node, parent, key, ancestors) => {
    if (parent) parents.set(node,parent);
    if (node.type === 'WithStatement' ||
        (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval')) dynamicScope = true;
    if (node.type === 'Identifier') identifiers.push({node,parent,key,ancestors});
    // A let alias is renameable when every later use remains an ownership-
    // preserving read. The identifier-use proof below rejects any reassignment,
    // destructuring write, escape, or dynamic-scope access.
    if (node.type === 'VariableDeclaration' && (node.kind === 'const' || node.kind === 'let')) {
      declarations.push(...node.declarations);
    }
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier' &&
        bindings.get(node.id.name) === 1) {
      let forwardIndex = -1;
      if (!node.async && !node.generator && node.body.body.length === 1 && node.body.body[0].type === 'ReturnStatement' &&
          node.body.body[0].argument?.type === 'Identifier') {
        /** @type {AstNode[]} */
        const params = node.params;
        forwardIndex = params.findIndex(p => p.type === 'Identifier' && p.name === node.body.body[0].argument.name);
      }
      functions.set(node.id.name,{node,params:node.params,forwardIndex});
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const key = node.callee.name;
      const sites=calls.get(key)??[];
      sites.push(node);
      calls.set(key,sites);
    }
  });
  if (dynamicScope) return null;
  // A cross-module signature is admitted only after the module graph has
  // proved the imported function is a stable, pure one-parameter identity.
  // It has no locally tracked parameters, but its return aliases argument 0.
  for (const [name,index] of importedIdentityFunctions) {
    if (index===0 && bindings.get(name)===1 && !functions.has(name)) {
      functions.set(name,{node:ast,params:[],forwardIndex:0,external:true});
    }
  }
  // A read-only helper returns a field value, not the object's identity.
  // Its direct calls may consume the owner without allowing alias forwarding.
  for (const [name,index] of importedConsumers) {
    if (index===0 && bindings.get(name)===1 && !functions.has(name)) {
      functions.set(name,{node:ast,params:[],forwardIndex:-1,consumerIndex:0,external:true});
    }
  }

  const scopes=collectBindingScopes(ast);
  /** @type {Set<string>} */
  const unusableFunctions = new Set();
  for (const {node,parent,key,ancestors} of identifiers) {
    if (!functions.has(node.name)) continue;
    const scope=scopes.get(node.name);
    if (!scope || !ancestors.includes(scope)) {
      unusableFunctions.add(node.name);
      continue;
    }
    if (parent?.type === 'FunctionDeclaration' && key === 'id') {
      if (ancestors.some(a => /^Export/.test(a.type))) unusableFunctions.add(node.name);
      continue;
    }
    if (functions.get(node.name)?.external && /^Import(?:Default|Namespace)?Specifier$/.test(parent?.type??'')) continue;
    if (!(parent?.type === 'CallExpression' && key === 'callee')) unusableFunctions.add(node.name);
  }
  for (const name of unusableFunctions) functions.delete(name);

  const aliases = new Set([rootName]);
  /** @param {AstNode|undefined|null} expression @returns {boolean} */
  function resolves(expression) {
    if (!expression) return false;
    if (expression.type === 'Identifier') return aliases.has(expression.name);
    if (expression.type === 'CallExpression' && expression.callee.type === 'Identifier') {
      const fn = functions.get(expression.callee.name);
      return Boolean(fn && fn.forwardIndex >= 0 && resolves(expression.arguments[fn.forwardIndex]));
    }
    return false;
  }
  // Monotone fixed point: aliases are only added, never removed.
  let changed;
  do {
    changed = false;
    for (const decl of declarations) {
      if (decl.id.type === 'Identifier' && bindings.get(decl.id.name) === 1 &&
          !aliases.has(decl.id.name) && resolves(decl.init)) {
        aliases.add(decl.id.name);
        changed = true;
      }
    }
    for (const [name, fn] of functions) {
      const sites = calls.get(name) || [];
      if (!sites.length) continue;
      for (let index = 0; index < fn.params.length; index++) {
        const param = fn.params[index];
        if (param.type !== 'Identifier' || bindings.get(param.name) !== 1 || aliases.has(param.name)) continue;
        if (sites.every(call => resolves(call.arguments[index]))) {
          aliases.add(param.name);
          changed = true;
        }
      }
    }
  } while (changed);

  // A const alias can be exported without any reference appearing in an
  // ExportSpecifier. Such exports reveal the object shape to untracked callers.
  // Only the original root binding may be intentionally exported by the
  // opt-in cross-module proof; its imported consumers are verified separately.
  for (const declaration of ast.body) {
    if (declaration.type !== 'ExportNamedDeclaration' ||
        declaration.declaration?.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declaration.declarations) {
      if (decl.id.type === 'Identifier' && decl.id.name !== rootName && aliases.has(decl.id.name)) {
        return null;
      }
    }
  }

  /** @type {AstNode[]} */
  const members = [];
  /** @type {AstNode[]} */
  const patterns = [];
  for (const {node,parent,key,ancestors} of identifiers) {
    if (!aliases.has(node.name)) continue;
    const scope=scopes.get(node.name);
    if (!scope || !ancestors.includes(scope)) return null;
    if (!parent) return null;
    if (key === 'id' && /^(VariableDeclarator|FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type)) continue;
    if (key === 'params' && /^Function/.test(parent.type)) continue;
    if (key === 'params' && parent.type === 'ArrowFunctionExpression') continue;
    if (/^Import(?:Default|Namespace)?Specifier$/.test(parent.type)) continue;
    if (parent.type === 'MemberExpression' && key === 'object') {
      const property = parent.computed ? staticString(parent.property) : staticName(parent.property);
      if (property === null) return null;
      members.push(parent);
      continue;
    }
    if (parent.type === 'VariableDeclarator' && key === 'init' &&
        parent.id.type === 'Identifier' && aliases.has(parent.id.name)) continue;
    if (parent.type === 'VariableDeclarator' && key === 'init' && parent.id.type === 'ObjectPattern') {
      // A direct, statically-keyed pattern reads own fields without escaping
      // the object. Restrict it to simple bindings so computed keys, rest
      // objects, and defaults cannot change behavior under a rename.
      /** @type {AstNode[]} */
      const fields = parent.id.properties;
      if (fields.some(p => p.type !== 'Property' || p.kind !== 'init' ||
          ownPropertyName(p) === null || p.value.type !== 'Identifier')) return null;
      patterns.push(...fields);
      continue;
    }
    if (parent.type === 'CallExpression' && key === 'arguments' && parent.callee.type === 'Identifier') {
      const fn = functions.get(parent.callee.name);
      const index = parent.arguments.indexOf(node);
      if (fn?.external && (index===fn.forwardIndex || index===fn.consumerIndex)) continue;
      if (fn && index >= 0 && fn.params[index]?.type === 'Identifier' && aliases.has(fn.params[index].name)) continue;
      return null;
    }
    if (parent.type === 'ReturnStatement' && key === 'argument') {
      const enclosing = [...ancestors].reverse().find(a => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(a.type));
      if (enclosing?.type === 'FunctionDeclaration' && (functions.get(enclosing.id?.name)?.forwardIndex??-1) >= 0) continue;
      return null;
    }
    return null;
  }
  // Member assignment can install a function whose `this` observes the
  // owner's property names, even if the assigned field itself is unrenamed.
  // Preserve hot arithmetic updates while refusing unproven function/object
  // assignments and method-call receivers.
  for (const member of members) {
    const consumer=parents.get(member);
    // Pattern and iteration targets can install opaque values without an
    // ordinary assignment node, allowing reflective methods on the object.
    if (consumer?.type==='ForOfStatement' && consumer.left===member ||
        consumer?.type==='ForInStatement' && consumer.left===member ||
        consumer?.type==='ObjectPattern' || consumer?.type==='ArrayPattern' ||
        consumer?.type==='Property' && parents.get(consumer)?.type==='ObjectPattern') return null;
    // Deletion can expose an inherited getter/value under the original key.
    // The property shape of Object.prototype is outside the local proof.
    const finalConsumer=consumer?.type==='ChainExpression' ? parents.get(consumer) : consumer;
    if (finalConsumer?.type==='UnaryExpression' && finalConsumer.operator==='delete') return null;
    if (consumer?.type==='AssignmentExpression' && consumer.left===member) {
      if (consumer.operator==='=') {
        const rhs=consumer.right;
        if (rhs.type!=='Literal' ||
            !['string','number','boolean','bigint'].includes(typeof rhs.value) && rhs.value!==null) return null;
      } else if (['&&=','||=','??='].includes(consumer.operator)) return null;
    }
    if (consumer?.type==='CallExpression' && consumer.callee===member ||
        consumer?.type==='TaggedTemplateExpression' && consumer.tag===member) return null;
  }
  // `arguments[0]` aliases parameters invisibly to name-based reference analysis.
  if (identifiers.some(({node}) => node.name === 'arguments') &&
      [...functions.values()].some(fn => fn.params.some((/** @type {AstNode} */ p) => p.type === 'Identifier' && aliases.has(p.name)))) return null;
  // A forwarded object must be consumed by a tracked const alias or discarded.
  for (const {node,parent,key} of identifiers) {
    if (parent?.type !== 'CallExpression' || key !== 'callee') continue;
    const fn = functions.get(node.name);
    if(!fn) continue;
    if (fn.forwardIndex < 0 || !resolves(parent.arguments[fn.forwardIndex])) continue;
    // Other returned values (including members of the call) are opaque.
    const callParent = parents.get(parent);
    if (callParent?.type === 'VariableDeclarator' && callParent.init === parent &&
        callParent.id.type === 'Identifier' && aliases.has(callParent.id.name)) continue;
    if (callParent?.type === 'ExpressionStatement') continue;
    return null;
  }
  return {aliases,members,patterns};
}

/**
 * Construct edits for a statically known object destructuring read. Shorthand
 * must be expanded to preserve its local binding name after the key changes.
 * @param {string} source
 * @param {AstNode[]} patterns
 * @param {Map<string,string>} mapping
 * @returns {import('./ast').Edit[]}
 */
function patternPropertyEdits(source,patterns,mapping) {
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  for (const property of patterns) {
    const old=ownPropertyName(property);
    if (old === null) continue;
    const replacement=mapping.get(old);
    if (!replacement) continue;
    if (property.shorthand) {
      edits.push({start:property.start,end:property.end,
        text:`${JSON.stringify(replacement)}:${source.slice(property.value.start,property.value.end)}`});
    } else {
      edits.push({start:property.key.start,end:property.key.end,text:JSON.stringify(replacement)});
    }
  }
  return edits;
}

/**
 * Rename selected object-literal own keys only when a closed-world use proof succeeds.
 * A conservative proof failure leaves the complete file unchanged for that object.
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string}} options
 * @returns {{code:string,objects:number,properties:number}}
 */
function renameLocalProperties(source, ast, options) {
  const bindings = collectBindings(ast);
  /** @type {{node:AstNode,name:string,properties:AstNode[]}[]} */
  const candidates = [];
  walk(ast,(node,parent,key,ancestors) => {
    if (node.type !== 'ObjectExpression' || parent?.type !== 'VariableDeclarator' || key !== 'init' ||
        parent.id.type !== 'Identifier' || bindings.get(parent.id.name) !== 1) return;
    const declaration = ancestors[ancestors.length - 2];
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const' ||
        ancestors.some(a => a.type === 'ExportNamedDeclaration' || a.type === 'ExportDefaultDeclaration')) return;
    /** @type {AstNode[]} */
    const properties = node.properties;
    if (!properties.length || properties.some(p => p.type !== 'Property' || p.method || p.shorthand || p.kind !== 'init' ||
          ownPropertyName(p) === null || ['__proto__','prototype','constructor'].includes(String(ownPropertyName(p))) || !isLiteralValue(p.value))) return;
    const names = properties.map(ownPropertyName);
    if (new Set(names).size !== names.length) return;
    candidates.push({node,name:parent.id.name,properties});
  });

  /** @type {import('./ast').Edit[]} */
  const edits = [];
  let objects = 0;
  let properties = 0;
  for (const candidate of candidates) {
    const proof = proveLocalObject(ast, candidate.name, bindings);
    if (!proof || (!proof.members.length && !proof.patterns.length)) continue;
    // An unowned field may invoke an inherited getter with this=object. That
    // getter can enumerate own keys, making otherwise private renaming visible.
    const ownNames=new Set(candidate.properties.map(ownPropertyName));
    if (proof.members.some(member=>!ownNames.has(member.computed ? staticString(member.property) : staticName(member.property))) ||
        proof.patterns.some(property=>!ownNames.has(ownPropertyName(property)))) continue;
    const mapping = new Map();
    for (const prop of candidate.properties) {
      const old = ownPropertyName(prop);
      const hash = createHash('sha256').update(`${options.seed}/${candidate.name}/${candidate.node.start}/${old}`).digest('hex').slice(0,10);
      mapping.set(old,`_p${hash}`);
    }
    // Truncated digests can collide. Duplicating literal keys silently changes
    // both object contents and all subsequent reads, so decline this object.
    if (new Set(mapping.values()).size !== mapping.size) continue;
    for (const prop of candidate.properties) edits.push({start:prop.key.start,end:prop.key.end,text:JSON.stringify(mapping.get(ownPropertyName(prop)))});
    for (const member of proof.members) {
      const name = member.computed ? staticString(member.property) : staticName(member.property);
      if (mapping.has(name)) edits.push({start:member.property.start,end:member.property.end,text:member.computed ? JSON.stringify(mapping.get(name)) : mapping.get(name)});
    }
    edits.push(...patternPropertyEdits(source,proof.patterns,mapping));
    objects++;
    properties += mapping.size;
  }
  return {code:applyEdits(source,edits),objects,properties};
}

module.exports = {renameLocalProperties,collectBindings,proveLocalObject,staticName,patternPropertyEdits,isLiteralValue,ownPropertyName};
