'use strict';

const {createHash} = require('node:crypto');
const {walk,applyEdits,observesFunctionSource,sourceSpelledErrorOperand} = require('./ast');
const {collectBindings} = require('./properties');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * The narrowed renamer only resolves bindings with a globally unique name,
 * and only when every reference is visibly enclosed by the correct lexical
 * scope. In particular, it refuses JS's dynamic scope forms (eval/with).
 * @param {AstNode} node
 * @param {AstNode|null} parent
 * @param {string|null} key
 * @returns {'reference'|'ignore'|'shorthand'|'ambiguous'}
 */
function classifyIdentifier(node,parent,key) {
  if (!parent) return 'ignore';
  if (parent.type==='Property') {
    if (parent.shorthand && !parent.computed) return 'shorthand';
    if (key==='key' && !parent.computed) return 'ignore';
  }
  if (parent.type==='MemberExpression' && key==='property' && !parent.computed) return 'ignore';
  if ((parent.type==='MethodDefinition'||parent.type==='PropertyDefinition') && key==='key' && !parent.computed) return 'ignore';
  if (/^(ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier)$/.test(parent.type)) return 'ignore';
  if (/^(ExportSpecifier|ExportDefaultDeclaration)$/.test(parent.type)) return 'ambiguous';
  if (parent.type==='MetaProperty' || parent.type==='LabeledStatement' && key==='label' ||
      /^(BreakStatement|ContinueStatement)$/.test(parent.type) && key==='label') return 'ignore';
  if (parent.type==='VariableDeclarator' && key==='id') return 'ignore';
  if (/^(FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type) && key==='id') return 'ignore';
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(parent.type) && key==='params') return 'ignore';
  if (parent.type==='CatchClause' && key==='param') return 'ignore';
  return 'reference';
}

/**
 * A bound wrapper around a constructible function can be constructed by an
 * external consumer. The resulting instance exposes target.prototype.constructor,
 * so Function#toString can observe every identifier spelling in the target body
 * and in the outer bindings referenced by that body. Bound arrows are exempt
 * only when the graph-wide proof explicitly admits their direct const binding.
 * Exported function bodies are source-exposed to consumers regardless.
 * @param {AstNode} ast
 * @param {boolean} allowBoundFunctionTargets
 * @returns {Set<AstNode>}
 */
function collectBoundTargetSourceExposedBodies(ast,allowBoundFunctionTargets) {
  const functionNodes=new Set();
  const functionBindings=new Map();
  const aliases=new Map();
  const constArrowBindings=new Set();
  const exportedNames=new Set();
  const exposed=new Set();
  let unknownBoundReceiver=false;
  let hasBindMember=false;
  let hasImportMeta=false;
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isFunctionNode(node) {
    return Boolean(node&&['FunctionDeclaration','FunctionExpression',
      'ArrowFunctionExpression','ClassDeclaration','ClassExpression'].includes(node.type));
  }
  /** @param {AstNode} node @returns {string|null} */
  function staticMemberName(node) {
    if(node.type!=='MemberExpression')return null;
    if(!node.computed&&node.property.type==='Identifier')return node.property.name;
    if(node.computed&&node.property.type==='Literal'&&typeof node.property.value==='string')
      return node.property.value;
    return null;
  }
  walk(ast,(node,parent,key)=>{
    if(isFunctionNode(node)) {
      functionNodes.add(node);
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier')
        functionBindings.set(node.id.name,node);
      if(parent?.type==='VariableDeclarator'&&parent.id?.type==='Identifier'&&parent.init===node) {
        functionBindings.set(parent.id.name,node);
        if(parent.kind==='const'&&node.type==='ArrowFunctionExpression')
          constArrowBindings.add(parent.id.name);
      }
    }
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&node.init?.type==='Identifier')
      aliases.set(node.id.name,node.init.name);
    if(node.type==='AssignmentExpression'&&node.left?.type==='Identifier'&&node.right?.type==='Identifier')
      aliases.set(node.left.name,node.right.name);
    if(node.type==='ExportSpecifier'&&node.local?.type==='Identifier')
      exportedNames.add(node.local.name);
    if(node.type==='ExportDefaultDeclaration') {
      if(node.declaration?.type==='Identifier')exportedNames.add(node.declaration.name);
      if(isFunctionNode(node.declaration))exposed.add(node.declaration);
    }
    if(node.type==='ExportNamedDeclaration'&&node.declaration) {
      if(isFunctionNode(node.declaration))exposed.add(node.declaration);
      if(node.declaration.type==='VariableDeclaration') {
        for(const declaration of node.declaration.declarations) {
          if(declaration.id?.type==='Identifier'&&isFunctionNode(declaration.init))
            exposed.add(declaration.init);
        }
      }
    }
    if(node.type==='MetaProperty'&&node.meta?.name==='import')hasImportMeta=true;
    if(node.type==='AssignmentExpression'&&node.left?.type==='MemberExpression'&&
       node.left.object?.type==='Identifier'&&node.left.object.name==='module'&&
       staticMemberName(node.left)==='exports') {
      // CommonJS export assignment makes any contained callable externally visible.
      for(const fn of functionNodes)exposed.add(fn);
    }
  });
  /**
   * @param {string} name
   * @param {Set<string>} [seen]
   * @returns {AstNode|null}
   */
  function resolveFunction(name,seen=new Set()) {
    if(functionBindings.has(name))return functionBindings.get(name);
    if(seen.has(name)||!aliases.has(name))return null;
    seen.add(name);
    return resolveFunction(aliases.get(name),seen);
  }
  for(const name of exportedNames) {
    const fn=resolveFunction(name);
    if(fn)exposed.add(fn);
  }
  walk(ast,(node,parent)=>{
    if(node.type!=='MemberExpression')return;
    const name=staticMemberName(node);
    if(name!=='bind'&&!(node.computed&&name===null))return;
    hasBindMember=true;
    const receiver=node.object;
    const target=receiver?.type==='Identifier'?resolveFunction(receiver.name):null;
    const provenArrow=allowBoundFunctionTargets&&name==='bind'&&!node.computed&&
      parent?.type==='CallExpression'&&parent.callee===node&&!parent.optional&&
      !node.optional&&parent.arguments.length===1&&
      parent.arguments[0]?.type==='Literal'&&parent.arguments[0].value===null&&
      receiver?.type==='Identifier'&&constArrowBindings.has(receiver.name)&&
      target?.type==='ArrowFunctionExpression';
    if(provenArrow)return;
    if(target)exposed.add(target);
    else if(isFunctionNode(receiver))exposed.add(receiver);
    else unknownBoundReceiver=true;
  });
  if(unknownBoundReceiver||hasImportMeta&&hasBindMember&&!allowBoundFunctionTargets) {
    for(const fn of functionNodes)exposed.add(fn);
  }
  return exposed;
}

/**
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string,sourceType:'script'|'module'|'commonjs',allowBoundFunctionTargets?:boolean}} options
 * @returns {{code:string,bindings:number}}
 */
function renameLocalIdentifiers(source,ast,options) {
  if(observesFunctionSource(ast)) return {code:source,bindings:0};
  const counts=collectBindings(ast);
  /** @type {{identifier:AstNode,name:string,scope:AstNode}[]} */
  const candidates=[];
  /** @type {{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[]}[]} */
  const identifiers=[];
  // Anonymous function/arrow/class expressions receive the assignment target's
  // name through NamedEvaluation. Mangling that binding changes observable
  // .name even when every lexical reference is rewritten correctly.
  /** @type {Set<string>} */
  const inferredNames=new Set();
  // V8 can embed the original binding spelling in TypeError messages such as
  // "callable is not a function" or "items is not iterable". Catching those
  // errors makes a lexical-only rename observably incorrect. Protect direct
  // callee/tag and iteration-source roots rather than disabling every rename.
  /** @type {Set<string>} */
  const errorSpellingNames=new Set();
  // The identity of a const binding initialized directly to an object literal
  // cannot become nullish. Object-pattern destructuring TypeErrors that name
  // their RHS source arise from null/undefined, so this narrowly proven class
  // can retain identifier mangling without sacrificing the error contract.
  /** @type {Set<string>} */
  const knownNonNullObjects=new Set();
  walk(ast,(node,parent)=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
        node.init?.type==='ObjectExpression' && parent?.type==='VariableDeclaration' &&
        parent.kind==='const' && counts.get(node.id.name)===1) {
      knownNonNullObjects.add(node.id.name);
    }
  });
  /**
   * V8 may spell an entire callee/iterable expression into a TypeError,
   * including computed keys and subexpressions: e.g.
   * "table[index] is not a function" or
   * "(0 , callback) is not a function". Protect all referenced lexical
   * names inside the operand. Examining only a member's root loses those
   * names even when the generated executable value remains identical.
   * @param {AstNode|null|undefined} expression
   */
  function markErrorRoot(expression) {
    if(!expression)return;
    walk(expression,(node,parent,key)=>{
      if(node.type!=='Identifier')return;
      if(node===expression || classifyIdentifier(node,parent,key)==='reference') {
        errorSpellingNames.add(node.name);
      }
    });
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function derivesBindingName(expression) {
    return Boolean(expression && (expression.type==='ArrowFunctionExpression' ||
      expression.type==='FunctionExpression' && !expression.id ||
      expression.type==='ClassExpression' && !expression.id));
  }
  let dynamic=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if (node.type==='Identifier') identifiers.push({node,parent,key,ancestors});
    const errorOperand=sourceSpelledErrorOperand(node);
    // Object spread accepts nullish sources and does not perform iteration.
    // Keep the existing proven-non-null object-pattern optimization too.
    const sourceSpellingProvenInert=
      node.type==='SpreadElement' && parent?.type==='ObjectExpression' ||
      node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
        node.init?.type==='Identifier' && knownNonNullObjects.has(node.init.name) ||
      node.type==='AssignmentExpression' && node.left.type==='ObjectPattern' &&
        node.right.type==='Identifier' && knownNonNullObjects.has(node.right.name);
    if(errorOperand && !sourceSpellingProvenInert)markErrorRoot(errorOperand);
    if (node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
        derivesBindingName(node.init)) inferredNames.add(node.id.name);
    if (node.type==='AssignmentExpression' && node.left.type==='Identifier' &&
        derivesBindingName(node.right)) inferredNames.add(node.left.name);
    // A destructuring default like [name = () => {}] also infers 'name'.
    if (node.type==='AssignmentPattern' && node.left.type==='Identifier' &&
        derivesBindingName(node.right)) inferredNames.add(node.left.name);
    if (node.type==='WithStatement' || node.type==='CallExpression' && node.callee.type==='Identifier' && node.callee.name==='eval') dynamic=true;
    if (node.type==='VariableDeclaration' && (node.kind==='const'||node.kind==='let') &&
        (parent?.type==='BlockStatement'||parent?.type==='Program') &&
        !ancestors.some(a=>/^Export/.test(a.type))) {
      const scope=parent;
      if (scope.type==='Program' && options.sourceType==='script') return;
      for(const dec of node.declarations) {
        if(dec.id.type==='Identifier') candidates.push({identifier:dec.id,name:dec.id.name,scope});
      }
    }
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
      for(const param of node.params) {
        if (param.type==='Identifier') candidates.push({identifier:param,name:param.name,scope:node});
        else if (param.type==='AssignmentPattern' && param.left.type==='Identifier') {
          candidates.push({identifier:param.left,name:param.left.name,scope:node});
        }
      }
    }
  });
  if (dynamic) return {code:source,bindings:0};
  const sourceExposedBodies=collectBoundTargetSourceExposedBodies(
    ast,options.allowBoundFunctionTargets===true);
  /** @type {Set<string>} */
  const sourceExposedNames=new Set();
  for(const item of identifiers) {
    if(item.ancestors.some(ancestor=>sourceExposedBodies.has(ancestor))&&
       classifyIdentifier(item.node,item.parent,item.key)!=='ignore')
      sourceExposedNames.add(item.node.name);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  // A free identifier can be captured by a newly introduced local binding,
  // even if it is spelled with Unicode escapes and absent from source regexes.
  const used=new Set([...counts.keys(),...identifiers.map(item=>item.node.name)]);
  let bindings=0;
  for(const candidate of candidates) {
    const {name,scope,identifier}=candidate;
    if (counts.get(name)!==1 || sourceExposedNames.has(name) ||
        inferredNames.has(name) || errorSpellingNames.has(name) ||
        ['arguments','eval','require','module','exports','globalThis','window'].includes(name)) continue;
    // TDZ ReferenceError messages expose the original binding spelling.
    // Until a control-flow dominance proof exists, reject a candidate when a
    // reference occurs lexically before the declaration or in its initializer.
    if (identifiers.some(item=>item.node!==identifier && item.node.name===name &&
        classifyIdentifier(item.node,item.parent,item.key)!=='ignore' &&
        (item.node.start < identifier.start || item.ancestors.some(ancestor=>
          (ancestor.type==='VariableDeclarator' && ancestor.id===identifier &&
            ancestor.init && ancestor.init.start<=item.node.start &&
            item.node.end<=ancestor.init.end ||
          ancestor.type==='AssignmentPattern' && ancestor.left===identifier &&
            ancestor.right && ancestor.right.start<=item.node.start &&
            item.node.end<=ancestor.right.end))))) continue;
    // A captured lexical binding can be read by a hoisted closure before
    // its initializer executes, even if the reference is textually later.
    // A thrown ReferenceError then names the binding, so changing its
    // spelling would change observable error.message. Without a
    // cross-function dominance proof, retain closure-captured let/const names.
    if ((scope.type==='BlockStatement'||scope.type==='Program') &&
        identifiers.some(item=>{
          if(item.node===identifier||item.node.name!==name||
             classifyIdentifier(item.node,item.parent,item.key)==='ignore')return false;
          const at=item.ancestors.indexOf(scope);
          return at!==-1 && item.ancestors.slice(at+1).some(ancestor=>
            /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(ancestor.type));
        })) continue;
    /** @type {import('./ast').Edit[]} */
    const local=[];
    let safe=true;
    const checksum=createHash('sha256').update(`${options.seed}/${identifier.start}/${name}`).digest('hex');
    let replacement='';
    for(let n=0;n<12;n++) {
      const proposed=`_v${checksum.slice(n,n+12)}`;
      if (!used.has(proposed) && !new RegExp(`\\b${proposed}\\b`,'u').test(source)) {
        replacement=proposed;
        break;
      }
    }
    if (!replacement) continue;
    /** @type {Set<string>} */
    const shorthandSpans=new Set();
    for(const item of identifiers) {
      if(item.node.name!==name) continue;
      if (item.node===identifier) {
        local.push({start:identifier.start,end:identifier.end,text:replacement});
        continue;
      }
      const role=classifyIdentifier(item.node,item.parent,item.key);
      if(role==='ignore') continue;
      if(role==='ambiguous' || !item.ancestors.includes(scope) ||
          item.ancestors.some(a=>a.type==='ObjectPattern')) {safe=false;break;}
      if(role==='shorthand') {
        const parent=item.parent;
        if(parent?.type!=='Property' || !item.ancestors.some(a=>a.type==='ObjectExpression')) {safe=false;break;}
        const span=`${item.node.start}:${item.node.end}`;
        if(!shorthandSpans.has(span)) {
          // Shorthand __proto__ creates an ordinary own data property, while
          // a noncomputed colon property invokes the object-literal prototype
          // setter. Keep the original data-property semantics after expansion.
          const keyText=name==='__proto__'?
            '['+JSON.stringify(name)+']' : JSON.stringify(name);
          local.push({start:item.node.start,end:item.node.end,text:`${keyText}:${replacement}`});
          shorthandSpans.add(span);
        }
        continue;
      }
      local.push({start:item.node.start,end:item.node.end,text:replacement});
    }
    if(!safe) continue;
    used.add(replacement);
    bindings++;
    edits.push(...local);
  }
  return {code:applyEdits(source,edits),bindings};
}

module.exports={renameLocalIdentifiers};
