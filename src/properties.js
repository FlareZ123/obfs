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
 * A direct pattern binding can retain its default expression unchanged:
 * lookup occurs against the same proven own property before and after the
 * name rewrite, so the default runs under identical value conditions.
 * The owner-usage scan separately rejects unproved references in defaults.
 * @param {AstNode} value
 * @returns {boolean}
 */
function isSimplePatternBinding(value) {
  return value.type === 'Identifier' ||
    value.type === 'AssignmentPattern' && value.left.type === 'Identifier';
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
 * A direct lexical parameter read does not infer a function name from its
 * enclosing object key. Restrict this local-owner extension to a unique
 * simple formal in the nearest function, avoiding unresolved names and
 * closure-scoped guesses. The separate owner-use proof still rejects escapes,
 * reflection, and source observers.
 * @param {AstNode} value
 * @param {AstNode[]} ancestors
 * @param {Map<string,number>} bindings
 * @returns {boolean}
 */
function isDirectParameterValue(value,ancestors,bindings) {
  if(value.type!=='Identifier'||bindings.get(value.name)!==1)return false;
  const fn=[...ancestors].reverse().find(node=>
    node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
    node.type==='ArrowFunctionExpression');
  return Boolean(fn && fn.params.some((/** @type {AstNode} */ param)=>
    param.type==='Identifier'&&param.name===value.name));
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
 * Resolve bounded compile-time computed own keys only when a same-scope
 * immutable key initializer executes before the private owner is created.
 * The scope must be a sequential Program or BlockStatement: a SwitchStatement
 * can jump past earlier lexical declarations into later cases.
 *
 * Imported root aliases have no local owner creation proof, so retain their
 * conservative dynamic-key refusal (including ESM cycle/TDZ cases).
 * @param {AstNode} ast
 * @param {string} rootName
 * @param {Map<string,number>} bindings
 * @param {Map<string,AstNode>} scopes
 * @returns {Map<string,string>}
 */
function collectOwnedConstantKeys(ast,rootName,bindings,scopes) {
  const ownerScope=scopes.get(rootName);
  /** @type {Map<string,string>} */
  const keys=new Map();
  if(!ownerScope||!['Program','BlockStatement'].includes(ownerScope.type))return keys;
  /** @type {AstNode|null} */
  let owner=null;
  walk(ast,(node,parent)=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
        node.id.name===rootName && parent?.type==='VariableDeclaration' &&
        parent.kind==='const' && bindings.get(rootName)===1)owner=node;
  });
  if(!owner)return keys;
  walk(ast,(node,parent)=>{
    if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||
       parent?.type!=='VariableDeclaration'||parent.kind!=='const'||
       bindings.get(node.id.name)!==1||scopes.get(node.id.name)!==ownerScope||
       node.start>=/** @type {AstNode} */ (owner).start||!node.init)return;
    const value=staticString(node.init);
    if(value!==null)keys.set(node.id.name,value);
  });
  return keys;
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
 * @param {Map<string,string>} [importedConstantKeys] Proven, unique named-import string values initialized before their exported owner.
 * @param {Map<string,string>} [importedSourceKeys] Verified string imports used only to detect source observation; this may include keys unrelated to the owner's fields.
 * @returns {{aliases:Set<string>,members:AstNode[],memberNames:Map<AstNode,string>,patterns:AstNode[],forwardedCalls:Set<AstNode>}|null}
 */
function proveLocalObject(ast, rootName, bindings, importedIdentityFunctions=new Map(), importedConsumers=new Map(), importedConstantKeys=new Map(), importedSourceKeys=importedConstantKeys) {
  if(observesFunctionSource(ast,importedSourceKeys)) return null;
  /** @type {Map<string,{node:AstNode,params:AstNode[],forwardIndex:number,returnsRoot?:boolean,external?:boolean,consumerIndex?:number}>} */
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
      let returnsRoot = false;
      if (!node.async && !node.generator && node.body.body.length === 1 && node.body.body[0].type === 'ReturnStatement' &&
          node.body.body[0].argument?.type === 'Identifier') {
        /** @type {AstNode[]} */
        const params = node.params;
        const returned=node.body.body[0].argument.name;
        forwardIndex = params.findIndex(p => p.type === 'Identifier' && p.name === returned);
        returnsRoot = !params.length && returned === rootName;
      }
      functions.set(node.id.name,{node,params:node.params,forwardIndex,returnsRoot});
    }
    // Immutable local forwarding expressions return one plain parameter,
    // or a captured immutable root through a zero-argument getter.
    // The use proof rejects exported getters, callback escape, reflection,
    // and unproved consumption of returned objects.
    if (node.type === 'VariableDeclarator' && parent?.type === 'VariableDeclaration' &&
        parent.kind === 'const' && node.id.type === 'Identifier' &&
        bindings.get(node.id.name) === 1) {
      const value=node.init;
      if (value && (value.type === 'ArrowFunctionExpression' ||
                    value.type === 'FunctionExpression') &&
          !value.async && !value.generator &&
          value.params.every((/** @type {AstNode} */ p)=>p.type === 'Identifier')) {
        const body=value.body.type === 'BlockStatement'
          ? value.body.body.length === 1 && value.body.body[0].type === 'ReturnStatement'
            ? value.body.body[0].argument : null
          : value.body;
        if (body?.type === 'Identifier') {
          const index=value.params.findIndex((/** @type {AstNode} */ p)=>p.name===body.name);
          const returnsRoot=!value.params.length && body.name===rootName;
          if (index>=0 || returnsRoot) functions.set(node.id.name,{
            node:value,params:value.params,forwardIndex:index,returnsRoot
          });
        } else if (body?.type === 'MemberExpression' &&
                   body.object.type === 'Identifier' &&
                   (body.computed ? staticString(body.property) :
                     staticName(body.property)) !== null &&
                   value.params.some((/** @type {AstNode} */ p)=>p.name===body.object.name)) {
          // A local, immutable reader consumes the tracked owner but returns
          // the field value, never an alias to the owner. The existing proof
          // requires every call to receive that same owner, checks the field
          // against its own keys, and rejects escaping function references.
          functions.set(node.id.name,{
            node:value,params:value.params,forwardIndex:-1,returnsRoot:false
          });
        }
      }
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
    if (Number.isSafeInteger(index) && index>=0 && bindings.get(name)===1 && !functions.has(name)) {
      functions.set(name,{node:ast,params:[],forwardIndex:-1,consumerIndex:index,external:true});
    }
  }

  const scopes=collectBindingScopes(ast);
  const constantKeys=collectOwnedConstantKeys(ast,rootName,bindings,scopes);
  // Cross-file key facts are supplied only by the owner/ESM import proof,
  // which checks the immutable export, sequential initialization and local
  // imported binding. Reject ambiguous shadowed names here as well.
  for(const [name,value] of importedConstantKeys) {
    if(bindings.get(name)===1)constantKeys.set(name,value);
  }
  // An unescaped, fixed-size private tuple can carry the owner through a
  // known slot. Other slots must contain inert primitive literals, so
  // constructing the tuple cannot invoke code that observes the owner.
  // Every holder use must read that same slot into a local binding. Unknown
  // indexes, mutation, reflection and all holder escapes retain original keys.
  /** @type {Map<string,{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[]}[]>} */
  const holderIdentifierUses=new Map();
  for(const entry of identifiers){
    const group=holderIdentifierUses.get(entry.node.name)??[];
    group.push(entry);
    holderIdentifierUses.set(entry.node.name,group);
  }
  /** @type {Map<string,{index:number}>} */
  const privateOwnerTuples=new Map();
  /** @type {Set<AstNode>} */
  const privateArrayLiteralElements=new Set();
  for(const decl of declarations){
    if(decl.id.type!=='Identifier'||decl.id.name===rootName||
       parents.get(decl)?.type!=='VariableDeclaration'||
       parents.get(decl)?.kind!=='const'||
       parents.get(/** @type {AstNode} */(parents.get(decl)))?.type==='ExportNamedDeclaration'||
       bindings.get(decl.id.name)!==1||
       decl.init?.type!=='ArrayExpression'||decl.init.elements.length<1||
       decl.init.elements.length>8)continue;
    const elements=/** @type {(AstNode|null)[]} */(decl.init.elements);
    const index=elements.findIndex(element=>
      element?.type==='Identifier'&&element.name===rootName);
    if(index<0||elements.some((element,slot)=>slot===index?false:
      !element||element.type!=='Literal'||
      !(element.value===null||['string','number','boolean','bigint'].includes(typeof element.value))))continue;
    const holder=decl.id.name;
    const scope=scopes.get(holder);
    if(!scope||scope!==scopes.get(rootName))continue;
    let valid=true;
    for(const entry of holderIdentifierUses.get(holder)??[]){
      if(entry.node===decl.id)continue;
      const {parent,key,ancestors}=entry;
      if(parent?.type==='Property'&&key==='key'&&!parent.computed||
         parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
         (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&
           key==='key'&&!parent.computed)continue;
      const read=parent?.type==='MemberExpression'&&key==='object'&&!parent.optional&&
        parent.computed&&parent.property.type==='Literal'&&parent.property.value===index;
      const receiver=read?parents.get(parent):null;
      if(!ancestors.includes(scope)||!read||
         receiver?.type!=='VariableDeclarator'||receiver.init!==parent||
         receiver.id.type!=='Identifier'||bindings.get(receiver.id.name)!==1||
         !declarations.includes(receiver)){
        valid=false;
        break;
      }
    }
    if(valid){
      privateOwnerTuples.set(holder,{index});
      privateArrayLiteralElements.add(/** @type {AstNode} */(elements[index]));
    }
  }
  // A private record with one owner-valued field can forward that owner
  // through static property reads. Inert companion fields cannot observe the
  // owner during record creation. The record and its selected member must
  // remain private; any escape, mutation or reflection suspends the proof.
  /** @type {Map<string,string>} */
  const privateOwnerRecords=new Map();
  /** @type {Set<AstNode>} */
  const privateRecordLiteralValues=new Set();
  for(const decl of declarations){
    if(decl.id.type!=='Identifier'||decl.id.name===rootName||
       parents.get(decl)?.type!=='VariableDeclaration'||
       parents.get(decl)?.kind!=='const'||
       parents.get(/** @type {AstNode} */(parents.get(decl)))?.type==='ExportNamedDeclaration'||
       bindings.get(decl.id.name)!==1||
       decl.init?.type!=='ObjectExpression'||
       decl.init.properties.length<1||decl.init.properties.length>8)continue;
    const fields=/** @type {AstNode[]} */ (decl.init.properties);
    const names=new Set();
    /** @type {AstNode|null} */
    let ownedValue=null;
    /** @type {string|null} */
    let ownedKey=null;
    let safe=true;
    for(const field of fields){
      if(field.type!=='Property'||field.kind!=='init'||field.computed||
         field.method||field.shorthand){
        safe=false;
        break;
      }
      const name=staticName(field.key);
      if(name===null||['__proto__','constructor','prototype'].includes(name)||
         names.has(name)){
        safe=false;
        break;
      }
      names.add(name);
      if(field.value.type==='Identifier'&&field.value.name===rootName){
        if(ownedValue!==null){safe=false;break;}
        ownedValue=field.value;
        ownedKey=name;
      }else if(field.value.type!=='Literal'||
          !(field.value.value===null||
            ['string','number','boolean','bigint'].includes(typeof field.value.value))){
        safe=false;
        break;
      }
    }
    if(!safe||!ownedValue||ownedKey===null)continue;
    const holder=decl.id.name;
    const scope=scopes.get(holder);
    if(!scope||scope!==scopes.get(rootName))continue;
    for(const entry of holderIdentifierUses.get(holder)??[]){
      if(entry.node===decl.id)continue;
      const {parent,key,ancestors}=entry;
      if(parent?.type==='Property'&&key==='key'&&!parent.computed||
         parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
         (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&
           key==='key'&&!parent.computed)continue;
      const read=parent?.type==='MemberExpression'&&key==='object'&&!parent.optional&&
        (parent.computed?staticString(parent.property):staticName(parent.property))===ownedKey;
      const receiver=read?parents.get(parent):null;
      if(!ancestors.includes(scope)||!read||
         receiver?.type!=='VariableDeclarator'||receiver.init!==parent||
         receiver.id.type!=='Identifier'||bindings.get(receiver.id.name)!==1||
         !declarations.includes(receiver)){
        safe=false;
        break;
      }
    }
    if(safe){
      privateOwnerRecords.set(holder,ownedKey);
      privateRecordLiteralValues.add(ownedValue);
    }
  }
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
    if (parent?.type === 'VariableDeclarator' && key === 'id' &&
        parent.init===functions.get(node.name)?.node) {
      // Exported zero-argument getters disclose the entire owner to unknown
      // external callers, even when their local call sites are all proven.
      if(functions.get(node.name)?.returnsRoot &&
          ancestors.some(a=>/^Export/.test(a.type)))unusableFunctions.add(node.name);
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
    if(expression.type==='MemberExpression'&&!expression.optional&&
       expression.computed&&expression.object.type==='Identifier'&&
       expression.property.type==='Literal'&&
       expression.property.value===privateOwnerTuples.get(expression.object.name)?.index)return true;
    if(expression.type==='MemberExpression'&&!expression.optional&&
       expression.object.type==='Identifier'&&
       (expression.computed?staticString(expression.property):staticName(expression.property))===
         privateOwnerRecords.get(expression.object.name))return true;
    if (expression.type === 'CallExpression' && expression.callee.type === 'Identifier') {
      const fn = functions.get(expression.callee.name);
      return Boolean(fn && (fn.returnsRoot ||
        fn.forwardIndex >= 0 && resolves(expression.arguments[fn.forwardIndex])));
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
  /** @type {Map<AstNode,string>} */
  const memberNames=new Map();
  /** @type {AstNode[]} */
  const patterns = [];
  for (const {node,parent,key,ancestors} of identifiers) {
    if (!aliases.has(node.name)) continue;
    // An ESTree Identifier used as a noncomputed property name is a grammar
    // token rather than a reference to the same-spelled lexical binding.
    // A forwarded parameter called "value" must not be confused with
    // unrelated literal keys such as {value: 7} or nested .value reads.
    if (parent?.type==='Property' && key==='key' && !parent.computed ||
        parent?.type==='MemberExpression' && key==='property' && !parent.computed ||
        (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition') &&
          key==='key' && !parent.computed) continue;
    const scope=scopes.get(node.name);
    if (!scope || !ancestors.includes(scope)) return null;
    if (!parent) return null;
    if (key === 'id' && /^(VariableDeclarator|FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type)) continue;
    if (key === 'params' && /^Function/.test(parent.type)) continue;
    if (key === 'params' && parent.type === 'ArrowFunctionExpression') continue;
    if (/^Import(?:Default|Namespace)?Specifier$/.test(parent.type)) continue;
    if (parent.type === 'MemberExpression' && key === 'object') {
      const property = parent.computed ?
        staticString(parent.property) ??
          (parent.property.type==='Identifier' ? constantKeys.get(parent.property.name)??null : null) :
        staticName(parent.property);
      if (property === null) return null;
      memberNames.set(parent,property);
      members.push(parent);
      continue;
    }
    if(parent.type==='ArrayExpression'&&privateArrayLiteralElements.has(node))continue;
    if(parent.type==='Property'&&key==='value'&&privateRecordLiteralValues.has(node))continue;
    if (parent.type === 'VariableDeclarator' && key === 'init' &&
        parent.id.type === 'Identifier' && aliases.has(parent.id.name)) continue;
    if (parent.type === 'VariableDeclarator' && key === 'init' && parent.id.type === 'ObjectPattern') {
      // A direct, statically-keyed pattern reads own fields without escaping
      // the object. Keep targets as plain identifiers, with optional defaults;
      // reject dynamic keys, rest bindings, and nested assignment targets.
      /** @type {AstNode[]} */
      const fields = parent.id.properties;
      if (fields.some(p => p.type !== 'Property' || p.kind !== 'init' ||
          ownPropertyName(p) === null || !isSimplePatternBinding(p.value))) return null;
      patterns.push(...fields);
      continue;
    }
    // A standalone destructuring assignment is another direct read of the
    // same proven own fields. Require the entire assignment to be a discarded
    // expression statement: its result is the original owner object, which
    // would otherwise escape through a surrounding expression.
    if (parent.type === 'AssignmentExpression' && key === 'right' &&
        parent.operator === '=' && parent.left.type === 'ObjectPattern' &&
        parents.get(parent)?.type === 'ExpressionStatement') {
      /** @type {AstNode[]} */
      const fields = parent.left.properties;
      if (fields.some(p => p.type !== 'Property' || p.kind !== 'init' ||
          ownPropertyName(p) === null || !isSimplePatternBinding(p.value))) return null;
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
      if (enclosing && [...functions.values()].some(fn=>
        fn.node===enclosing && (fn.forwardIndex>=0 || fn.returnsRoot))) continue;
      return null;
    }
    if (parent.type === 'ArrowFunctionExpression' && key === 'body' &&
        [...functions.values()].some(fn=>
          fn.node===parent && (fn.forwardIndex>=0 || fn.returnsRoot))) continue;
    return null;
  }
  // `arguments[0]` aliases parameters invisibly to name-based reference analysis.
  if (identifiers.some(({node}) => node.name === 'arguments') &&
      [...functions.values()].some(fn => fn.params.some((/** @type {AstNode} */ p) => p.type === 'Identifier' && aliases.has(p.name)))) return null;
  // A forwarded object must be consumed by a tracked const alias or discarded.
  for (const {node,parent,key} of identifiers) {
    if (parent?.type !== 'CallExpression' || key !== 'callee') continue;
    const fn = functions.get(node.name);
    if(!fn) continue;
    if (!fn.returnsRoot &&
        (fn.forwardIndex < 0 || !resolves(parent.arguments[fn.forwardIndex]))) continue;
    // Other returned values (including members of the call) are opaque.
    const callParent = parents.get(parent);
    if (callParent?.type === 'VariableDeclarator' && callParent.init === parent &&
        callParent.id.type === 'Identifier' && aliases.has(callParent.id.name)) continue;
    if (callParent?.type === 'ExpressionStatement') continue;
    // A forwarded owner can be destructured immediately without binding the
    // complete object. Require plain known keys and simple binding targets,
    // and forbid assignment-expression result exposure to another consumer.
    const objectPattern=callParent?.type==='VariableDeclarator' &&
      callParent.init===parent ? callParent.id :
      callParent?.type==='AssignmentExpression' && callParent.operator==='=' &&
      callParent.right===parent &&
      parents.get(callParent)?.type==='ExpressionStatement' ?
        callParent.left : null;
    if(objectPattern?.type==='ObjectPattern') {
      /** @type {AstNode[]} */
      const fields=objectPattern.properties;
      if(fields.some(field=>field.type!=='Property' || field.kind!=='init' ||
          ownPropertyName(field)===null ||
          !isSimplePatternBinding(field.value))) return null;
      patterns.push(...fields);
      continue;
    }
    // A verified return of the owner may feed one immediate, statically
    // keyed member read without first creating an alias variable.  Record
    // that member in the same edit/TypeError checks used for direct aliases.
    // Optional calls and unknown computed keys retain the original shape.
    if (callParent?.type === 'MemberExpression' &&
        callParent.object === parent && !callParent.optional && !parent.optional) {
      const property = callParent.computed ?
        staticString(callParent.property) ??
          (callParent.property.type === 'Identifier' ?
            constantKeys.get(callParent.property.name) ?? null : null) :
        staticName(callParent.property);
      if (property === null) return null;
      memberNames.set(callParent,property);
      members.push(callParent);
      continue;
    }
    // A forwarding call can feed another already-proven direct consumer.
    // Both functions must be admitted by the no-escape proof, and the
    // receiving formal must be a tracked alias. This preserves ownership
    // through reader(identity(root)) without treating reader results as aliases.
    if (callParent?.type === 'CallExpression' &&
        callParent.callee.type === 'Identifier') {
      const receiver=functions.get(callParent.callee.name);
      const index=callParent.arguments.indexOf(parent);
      if(index>=0 && receiver &&
         (receiver.external && (index===receiver.forwardIndex ||
           index===receiver.consumerIndex) ||
          receiver.params[index]?.type==='Identifier' &&
            aliases.has(receiver.params[index].name))) continue;
    }
    return null;
  }
  // Validate all members after forwarding has added its immediate reads.
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
    // V8 can print the source spelling of a failed callee or iterable
    // operand, e.g. "owner.secretField is not iterable", or
    // "target[owner.secretField] is not a function". Renaming a member
    // anywhere inside that expression would alter an observable TypeError
    // even without Function#toString or a stack observation. Reject such
    // contexts through the enclosing AST expression chain. A nested
    // function body is a separately executed expression and does not become
    // part of its enclosing function object's operand spelling.
    let expression=member;
    let ancestor=consumer;
    while(ancestor) {
      if(ancestor.type==='CallExpression' && ancestor.callee===expression ||
         ancestor.type==='NewExpression' && ancestor.callee===expression ||
         ancestor.type==='TaggedTemplateExpression' && ancestor.tag===expression ||
         ancestor.type==='ForOfStatement' && ancestor.right===expression ||
         ancestor.type==='SpreadElement' && ancestor.argument===expression ||
         ancestor.type==='VariableDeclarator' && ancestor.init===expression &&
           ancestor.id.type==='ArrayPattern' ||
         ancestor.type==='AssignmentExpression' && ancestor.right===expression &&
           ancestor.left.type==='ArrayPattern' ||
         ancestor.type==='YieldExpression' && ancestor.delegate &&
           ancestor.argument===expression) return null;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(ancestor.type))break;
      expression=ancestor;
      ancestor=parents.get(expression);
    }
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

  }
  /** @type {Set<AstNode>} */
  const forwardedCalls=new Set();
  // Expose already-proven direct identity-return expressions to the
  // cross-file reader verifier. The receiving call is separately checked
  // against an imported read-only function and its parameter ownership.
  walk(ast,node=>{
    if(node.type==='CallExpression' && resolves(node))forwardedCalls.add(node);
  });
  return {aliases,members,memberNames,patterns,forwardedCalls};
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
 * Prove a private zero-argument factory has exactly one direct invocation,
 * creating an inert object literal in the specified binding initializer.
 * Exported, aliased, mutable, dynamically invoked or observable factories
 * are excluded by explicit bindings and AST-reference checks. Intended for
 * both local-owner and opt-in closed-world ESM ownership proofs.
 *
 * @param {AstNode} ast
 * @param {Map<string,number>} bindings
 * @param {AstNode} expression
 * @returns {AstNode|null}
 */
function singleUseFactoryObject(ast,bindings,expression) {
  if(expression.type!=='CallExpression'||expression.optional||expression.arguments.length)return null;
  /**
   * The IIFE function value never escapes; it can create a private owner
   * directly without a named binding or a separate use-count proof.
   * @param {AstNode} factory
   * @returns {AstNode|null}
   */
  function returnedLiteral(factory) {
    if(factory.async||factory.generator||factory.params.length)return null;
    const body=factory.body.type==='BlockStatement' ?
      factory.body.body.length===1&&factory.body.body[0].type==='ReturnStatement' ?
        factory.body.body[0].argument : null :
      factory.body;
    return body?.type==='ObjectExpression'?body:null;
  }
  if(['ArrowFunctionExpression','FunctionExpression'].includes(expression.callee.type)) {
    return returnedLiteral(expression.callee);
  }
  if(expression.callee.type!=='Identifier')return null;
  const name=expression.callee.name;
  if(bindings.get(name)!==1)return null;
  /** @type {AstNode|null} */
  let fn=null;
  /** @type {AstNode|null} */
  let definition=null;
  for(const statement of ast.body) {
    if(statement.type==='FunctionDeclaration'&&statement.id?.type==='Identifier'&&
       statement.id.name===name) {
      fn=statement;
      definition=statement.id;
      break;
    }
    if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
       statement.declarations.length===1) {
      const dec=statement.declarations[0];
      if(dec.id.type==='Identifier'&&dec.id.name===name&&dec.init&&
         ['ArrowFunctionExpression','FunctionExpression'].includes(dec.init.type)) {
        fn=dec.init;
        definition=dec.id;
        break;
      }
    }
  }
  if(!fn||!definition)return null;
  const body=returnedLiteral(fn);
  if(!body)return null;
  let references=0;
  walk(ast,(node,parent,key)=>{
    if(node.type!=='Identifier'||node.name!==name||node===definition)return;
    if(parent===expression&&key==='callee')references++;
    else references=2;
  });
  return references===1?body:null;
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
    if (parent?.type !== 'VariableDeclarator' || key !== 'init' ||
        parent.id.type !== 'Identifier' || bindings.get(parent.id.name) !== 1) return;
    const declaration = ancestors[ancestors.length - 2];
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const' ||
        ancestors.some(a => a.type === 'ExportNamedDeclaration' || a.type === 'ExportDefaultDeclaration')) return;
    const literal=node.type==='ObjectExpression' ? node : singleUseFactoryObject(ast,bindings,node);
    if(!literal)return;
    /** @type {AstNode[]} */
    const properties = literal.properties;
    if (!properties.length || properties.some(p => p.type !== 'Property' || p.method || p.kind !== 'init' ||
          ownPropertyName(p) === null || ['__proto__','prototype','constructor'].includes(String(ownPropertyName(p))) ||
          !(isLiteralValue(p.value) || literal===node &&
            isDirectParameterValue(p.value,ancestors,bindings)))) return;
    const names = properties.map(ownPropertyName);
    if (new Set(names).size !== names.length) return;
    candidates.push({node:literal,name:parent.id.name,properties});
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
    if (proof.members.some(member=>{const field=proof.memberNames.get(member);return typeof field!=='string'||!ownNames.has(field);}) ||
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
    for (const prop of candidate.properties) {
      const renamed=JSON.stringify(mapping.get(ownPropertyName(prop)));
      // A shorthand field has a single token serving both key and value.
      // Expand only that token into a string key plus the original bound
      // identifier. This preserves Evaluation/GetValue of a pre-existing
      // lexical value and avoids inventing a new anonymous function name.
      const text=prop.shorthand ?
        renamed+':'+source.slice(prop.value.start,prop.value.end) : renamed;
      edits.push({start:prop.key.start,end:prop.key.end,text});
    }
    for (const member of proof.members) {
      const name=proof.memberNames.get(member);
      if (name!==undefined && mapping.has(name)) edits.push({start:member.property.start,end:member.property.end,
        text:member.computed ? JSON.stringify(mapping.get(name)) : mapping.get(name)});
    }
    edits.push(...patternPropertyEdits(source,proof.patterns,mapping));
    objects++;
    properties += mapping.size;
  }
  return {code:applyEdits(source,edits),objects,properties};
}

module.exports = {renameLocalProperties,collectBindings,proveLocalObject,staticName,patternPropertyEdits,isLiteralValue,ownPropertyName,singleUseFactoryObject};
