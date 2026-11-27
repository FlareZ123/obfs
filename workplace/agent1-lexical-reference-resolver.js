'use strict';

/**
 * Conservative lexical binding reference resolver for JavaScript ESTree.
 * This experiment classifies host-global spelling candidates, not native host
 * identity. It must not be used to authorize a source transform by itself.
 *
 * @typedef {{type:string,start:number,end:number,[key:string]:any}} AstNode
 * @typedef {'module'|'script'|'commonjs'} SourceType
 * @typedef {{kind:'local',name:string,bindingId:number}|{kind:'free-host-candidate',name:string}|{kind:'unknown',name:string,reason:string}} Resolution
 * @typedef {'read'|'write'|'read-write'|'call'|'construct'|'computed-key'|'export-local'|'unknown'} ReferenceRole
 * @typedef {{node:AstNode,name:string,start:number,end:number,resolution:Resolution,role:ReferenceRole}} Reference
 * @typedef {{node:AstNode,name:string,start:number,end:number,kind:string,bindingId:number|null}} Declaration
 * @typedef {{parent:Scope|null,kind:string,bindings:Map<string,Binding>,uncertain:Set<string>,directEval:boolean,dynamicWith:boolean,nonSimpleParams?:boolean}} Scope
 * @typedef {{id:number,name:string,kind:string}} Binding
 * @typedef {{sourceStart:number,sourceEnd:number,outerBindingId:number,innerBindingId:number}} ClassSpellingCoupling
 */

const HOST_NAMES = new Set(['globalThis','window','self','global','Storage','localStorage','sessionStorage']);

/** @param {AstNode} root @param {SourceType} sourceType @returns {{references:Reference[],declarations:Declaration[],classSpellingCouplings:ClassSpellingCoupling[],at:(start:number)=>Reference|undefined}} */
function resolveLexicalReferences(root,sourceType) {
  if (root.type !== 'Program') throw new TypeError('Expected Acorn Program');
  if (!['script','module','commonjs'].includes(sourceType)) throw new TypeError('Invalid source type');
  /** @type {Scope} */
  const program = {parent:null,kind:'program',bindings:new Map(),uncertain:new Set(),directEval:false,dynamicWith:false};
  /** @type {WeakMap<object, Scope>} */
  const scopes = new WeakMap();
  /** @type {WeakSet<object>} */
  const declarations = new WeakSet();
  /** @type {Reference[]} */
  const references = [];
  /** @type {(Declaration & {scope:Scope})[]} */
  const declarationRecords = [];
  /** @type {ClassSpellingCoupling[]} */
  const classSpellingCouplings = [];
  /** @type {{node:AstNode,scope:Scope}[]} */
  const evalCalls = [];
  let bindingCounter=0;

  /** @param {Scope} parent @param {string} kind @returns {Scope} */
  function child(parent,kind) {
    return {parent,kind,bindings:new Map(),uncertain:new Set(),directEval:false,dynamicWith:kind==='with'};
  }
  /** @param {Scope} scope @param {string} name @param {string} kind @param {AstNode} node */
  function declare(scope,name,kind,node) {
    let binding=scope.bindings.get(name);
    if(!binding && scope.kind==='function-body' && !scope.nonSimpleParams &&
       ['var','function'].includes(kind)) {
      const parameter=scope.parent?.bindings.get(name);
      if(parameter?.kind==='param') {
        binding=parameter;
        scope.bindings.set(name,binding);
      }
    }
    if (binding) {
      const sameVarFunction=['var','function'].includes(kind) &&
        ['var','function'].includes(binding.kind);
      const paramVar=(scope.kind==='function'||
        scope.kind==='function-body'&&!scope.nonSimpleParams) &&
        (['var','function'].includes(kind) && binding.kind==='param' ||
         kind==='param' && ['var','function'].includes(binding.kind));
      const duplicatedSloppyParam=sourceType!=='module' &&
        kind==='param' && binding.kind==='param';
      if (sameVarFunction) {
        if (kind==='function') binding.kind='function';
      } else if(!paramVar&&!duplicatedSloppyParam)scope.uncertain.add(name);
    } else {
      binding={id:++bindingCounter,name,kind};
      scope.bindings.set(name,binding);
    }
    // A separate non-simple parameter environment can contribute an initial
    // value to a body binding. Do not claim independent rename safety yet.
    if(scope.kind==='function-body' && scope.nonSimpleParams &&
       scope.parent?.bindings.has(name) && ['var','function'].includes(kind))
      scope.uncertain.add(name);
    declarationRecords.push({node,name,start:node.start,end:node.end,
      kind,bindingId:binding.id,scope});
  }
  /** @param {Scope} scope @returns {Scope} */
  function varScope(scope) {
    for(let s=scope;;s=s.parent) if (s.kind==='function'||s.kind==='function-body'||s.kind==='program'||
       s.kind==='static-block'||!s.parent)return s;
  }
  /** @param {AstNode|null} node @param {Scope} scope @param {string} kind */
  function declarePattern(node,scope,kind) {
    if (!node) return;
    switch(node.type) {
      case 'Identifier': declarations.add(node);declare(scope,node.name,kind,node);break;
      case 'RestElement': declarePattern(node.argument,scope,kind);break;
      case 'AssignmentPattern': declarePattern(node.left,scope,kind);break;
      case 'ArrayPattern': for(const el of node.elements)declarePattern(el,scope,kind);break;
      case 'ObjectPattern': for(const p of node.properties){
        if(p.type==='RestElement')declarePattern(p.argument,scope,kind);
        else declarePattern(p.value,scope,kind);
      }break;
      default: throw new TypeError('Unsupported binding pattern: '+node.type);
    }
  }
  /** @param {AstNode|null} pattern @param {string} name @returns {boolean} */
  function patternContainsName(pattern,name) {
    if(!pattern)return false;
    switch(pattern.type){
      case 'Identifier':return pattern.name===name;
      case 'AssignmentPattern':return patternContainsName(pattern.left,name);
      case 'RestElement':return patternContainsName(pattern.argument,name);
      case 'ArrayPattern':
        for(const element of pattern.elements)
          if(patternContainsName(element,name))return true;
        return false;
      case 'ObjectPattern':
        for(const property of pattern.properties)
          if(patternContainsName(property.type==='RestElement'?
            property.argument:property.value,name))return true;
        return false;
      default:return false;
    }
  }
  /** @param {AstNode} node @param {(child:AstNode,key:string)=>void} fn */
  function children(node,fn) {
    for(const [key,value] of Object.entries(node)) {
      if(key==='parent'||key==='comments')continue;
      if(Array.isArray(value)){
        for(const item of value)if(item&&typeof item==='object'&&typeof item.type==='string')fn(item,key);
      }else if(value&&typeof value==='object'&&typeof value.type==='string')fn(value,key);
    }
  }
  /** @param {AstNode} node @param {Scope} incoming @param {AstNode|null} parent @param {string|null} key */
  function collect(node,incoming,parent,key) {
    // A with-object expression is evaluated in the incoming lexical scope.
    // Only its statement body has an injected object environment record.
    if(node.type==='WithStatement') {
      scopes.set(node,incoming);
      collect(node.object,incoming,node,'object');
      collect(node.body,child(incoming,'with'),node,'body');
      return;
    }
    // The switch discriminant is evaluated in the incoming environment.
    // Case tests and consequents share the new CaseBlock lexical scope;
    // case var declarations still hoist to the enclosing function.
    if(node.type==='SwitchStatement') {
      scopes.set(node,incoming);
      collect(node.discriminant,incoming,node,'discriminant');
      const cases=child(incoming,'switch');
      for(const clause of node.cases)collect(clause,cases,node,'cases');
      return;
    }
    let scope=incoming;
    if(node!==root) {
      if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression') {
        // Function declarations bind in their containing lexical environment.
        if(node.type==='FunctionDeclaration' && node.id) {
          declarations.add(node.id);
          const outer = incoming;
          const isBlock=outer.kind==='block'||outer.kind==='switch'||outer.kind==='loop';
          if(isBlock&&sourceType!=='module') varScope(outer).uncertain.add(node.id.name); // Annex B
          declare(outer,node.id.name,isBlock?'block-function':'function',node.id);
        }
        scope=child(incoming,'function');
        if(node.type==='FunctionExpression'&&node.id)declarePattern(node.id,scope,'function-name');
        for(const param of node.params)declarePattern(param,scope,'param');
      }else if(node.type==='ClassDeclaration'||node.type==='ClassExpression'){
        if(node.type==='ClassDeclaration'&&node.id)declarePattern(node.id,incoming,'class');
        scope=child(incoming,'class');
        // Named class declarations have *two* runtime name bindings but only
        // *one* source identifier token. The outer binding is mutable; the
        // inner immutable class-name is captured by extends/methods/statics.
        // Expose a distinct inner identity and an explicit spelling coupling
        // so a future name-rewrite gate cannot rename their source separately.
        // The inner binding is not a second independently spelled declaration.
        if(node.type==='ClassDeclaration'&&node.id){
          const outer=incoming.bindings.get(node.id.name);
          if(!outer)throw new Error('Missing outer class declaration binding');
          const inner={id:++bindingCounter,name:node.id.name,kind:'class-name'};
          scope.bindings.set(node.id.name,inner);
          classSpellingCouplings.push({
            sourceStart:node.id.start,sourceEnd:node.id.end,
            outerBindingId:outer.id,innerBindingId:inner.id
          });
        }
        if(node.type==='ClassExpression'&&node.id)declarePattern(node.id,scope,'class-name');
      }else if(node.type==='BlockStatement'){
        // A non-simple formal parameter list has a parameter environment
        // separate from body var/function declarations. Default initializers
        // cannot resolve body-only vars, even when those vars are hoisted.
        const functionBody=parent && key==='body' &&
          ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(parent.type);
        const nonSimple=functionBody && parent.params.some((/** @type {AstNode} */ param)=>param.type!=='Identifier');
        scope=child(incoming,functionBody?'function-body':'block');
        if(functionBody)scope.nonSimpleParams=Boolean(nonSimple);
      }
      else if(node.type==='StaticBlock')scope=child(incoming,'static-block');
      else if(node.type==='CatchClause'){
        scope=child(incoming,'catch');
        declarePattern(node.param,scope,'catch');
      }else if(['ForStatement','ForInStatement','ForOfStatement'].includes(node.type))scope=child(incoming,'loop');


    }
    scopes.set(node,scope);
    if(node.type==='VariableDeclaration'){
      for(const dec of node.declarations){
        // Annex B catch parameter / var name interactions are not independent
        // bindings for source-renaming purposes. In a simple catch parameter,
        // a same-spelled var initializer writes the catch binding rather than
        // the hoisted var binding. Do not issue independently usable IDs.
        if(node.kind==='var'){
          const owner=varScope(scope);
          /** @type {Scope|null} */
          let enclosing=scope;
          for(;enclosing;enclosing=enclosing.parent){
            if(enclosing.kind==='catch' && varScope(enclosing)===owner){
              for(const [name,binding] of enclosing.bindings){
                if(binding.kind==='catch' && patternContainsName(dec.id,name)){
                  enclosing.uncertain.add(name);
                  owner.uncertain.add(name);
                }
              }
            }
            if(enclosing===owner)break;
          }
        }
        declarePattern(dec.id,node.kind==='var'?varScope(scope):scope,node.kind);
      }
    }
    if(node.type==='ImportDeclaration'){
      for(const spec of node.specifiers)declarePattern(spec.local,scope,'import');
    }
    if(node.type==='CallExpression' && node.callee.type==='Identifier' &&
       node.callee.name==='eval' && !node.optional)evalCalls.push({node,scope});
    children(node,(c,k)=>collect(c,scope,node,k));
  }
  collect(root,program,null,null);

  // Any direct syntactic eval(...) can call the intrinsic eval function
  // even when its identifier is shadowed by a parameter or local binding.
  // The runtime value might be the intrinsic, e.g. f(eval) where
  // function f(eval){ eval('var window=1'); return window; }.
  // Without proving the effective callable, conservatively taint this
  // activation and nested closures. An unrelated sibling stays untainted.
  for(const entry of evalCalls)varScope(entry.scope).directEval=true;
  /** @param {Scope} scope @param {string} name @returns {Resolution} */
  function resolve(scope,name) {
    /** @type {Scope|null} */
    let s=scope;
    for(;s;s=s.parent){
      if(s.dynamicWith)return {kind:'unknown',name,reason:'with-object-environment'};
      if(s.directEval)return {kind:'unknown',name,reason:'direct-eval-in-lexical-ancestor'};
      if(s.uncertain.has(name))return {kind:'unknown',name,reason:'ambiguous-declaration'};
      const binding=s.bindings.get(name);
      if(binding) {
        if(s.kind==='program'&&sourceType==='script'&&
           ['var','function'].includes(binding.kind))
          return {kind:'unknown',name,reason:'classic-script-global-object-declaration'};
        return {kind:'local',name,bindingId:binding.id};
      }
    }
    return HOST_NAMES.has(name)?{kind:'free-host-candidate',name}:
      {kind:'unknown',name,reason:'unproven-free-name'};
  }
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors @returns {boolean} */
  function isReference(node,parent,key,ancestors) {
    if(declarations.has(node)||!parent)return false;
    if(parent.type==='MemberExpression'&&!parent.computed&&key==='property')return false;
    if((parent.type==='Property'||parent.type==='MethodDefinition'||parent.type==='PropertyDefinition')&&
       key==='key'&&!parent.computed)return false;
    if(parent.type==='LabeledStatement'&&key==='label'||
       (parent.type==='BreakStatement'||parent.type==='ContinueStatement')&&key==='label')return false;
    if(parent.type==='MetaProperty')return false;
    if(parent.type==='ImportSpecifier' || parent.type==='ImportDefaultSpecifier' || parent.type==='ImportNamespaceSpecifier')return false;
    if(parent.type==='ExportSpecifier'&&(key==='exported'||
       ancestors.some(a=>a.type==='ExportNamedDeclaration'&&a.source)))return false;
    // Re-export namespace names and import-attribute keys are grammar labels.
    if(parent.type==='ExportAllDeclaration'&&key==='exported')return false;
    if(parent.type==='ImportAttribute'&&key==='key')return false;
    if(parent.type==='PrivateIdentifier')return false;
    return true;
  }
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors @returns {ReferenceRole} */
  function referenceRole(node,parent,key,ancestors) {
    if (!parent) return 'unknown';
    if (parent.type==='ExportSpecifier'&&key==='local'||
        parent.type==='ExportDefaultDeclaration'&&key==='declaration')return 'export-local';
    if (parent.type==='CallExpression'&&key==='callee'||
        parent.type==='TaggedTemplateExpression'&&key==='tag')return 'call';
    if (parent.type==='NewExpression'&&key==='callee')return 'construct';
    if (parent.type==='UpdateExpression'&&key==='argument')return 'read-write';
    // A direct sloppy delete mutates the identifier reference itself.
    if(parent.type==='UnaryExpression'&&parent.operator==='delete'&&
       key==='argument')return 'write';
    if (parent.type==='AssignmentExpression'&&key==='left')
      return parent.operator==='='?'write':'read-write';
    if (parent.type==='AssignmentPattern'&&key==='left')return 'write';
    if (parent.type==='MemberExpression'&&key==='property'&&parent.computed||
        ['Property','MethodDefinition','PropertyDefinition'].includes(parent.type)&&
          key==='key'&&parent.computed)return 'computed-key';
    if (['ForInStatement','ForOfStatement'].includes(parent.type)&&key==='left')return 'write';
    // In a destructuring LHS, the assigned binding and the expressions
    // used to compute a default, member receiver or key have different roles.
    // Follow the actual AST branch upward; source-range containment alone
    // would misclassify an evaluated receiver/default as a binding write.
    for(let i=ancestors.length-1;i>=0;i--){
      const a=ancestors[i];
      const branch=ancestors[i+1]||node;
      if(a.type==='MemberExpression' &&
         (a.object===branch||a.property===branch))return 'read';
      if(a.type==='AssignmentPattern'&&a.right===branch)return 'read';
      if(a.type==='Property'&&a.computed&&a.key===branch)return 'read';
      if(a.type==='AssignmentExpression'&&a.left===branch)
        return a.operator==='='?'write':'read-write';
      if(['ForInStatement','ForOfStatement'].includes(a.type)&&
         a.left===branch&&a.left.type!=='VariableDeclaration')return 'write';
    }
    return 'read';
  }
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors */
  function visit(node,parent,key,ancestors) {
    if(node.type==='Identifier' && isReference(node,parent,key,ancestors)){
      const scope=scopes.get(node);
      if(!scope)throw new Error('Missing lexical scope');
      references.push({node,name:node.name,start:node.start,end:node.end,
        resolution:resolve(scope,node.name),role:referenceRole(node,parent,key,ancestors)});
    }
    const next=[...ancestors,node];
    children(node,(c,k)=>visit(c,node,k,next));
  }
  visit(root,null,null,[]);
  const declarationTable=declarationRecords.map(record=>({node:record.node,
    name:record.name,start:record.start,end:record.end,kind:record.kind,
    bindingId:record.scope.uncertain.has(record.name)?null:record.bindingId}));
  return {references,declarations:declarationTable,classSpellingCouplings,
    at:(start)=>references.find(r=>r.start===start)};
}

module.exports={resolveLexicalReferences};
