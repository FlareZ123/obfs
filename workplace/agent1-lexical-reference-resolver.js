'use strict';

/**
 * Conservative lexical binding reference resolver for JavaScript ESTree.
 * This experiment classifies host-global spelling candidates, not native host
 * identity. It must not be used to authorize a source transform by itself.
 *
 * @typedef {{type:string,start:number,end:number,[key:string]:any}} AstNode
 * @typedef {'module'|'script'|'commonjs'} SourceType
 * @typedef {{kind:'local',name:string,bindingId:number}|{kind:'free-host-candidate',name:string}|{kind:'unknown',name:string,reason:string}} Resolution
 * @typedef {{node:AstNode,name:string,start:number,end:number,resolution:Resolution}} Reference
 * @typedef {{parent:Scope|null,kind:string,bindings:Map<string,Binding>,uncertain:Set<string>,directEval:boolean,dynamicWith:boolean}} Scope
 * @typedef {{id:number,name:string,kind:string}} Binding
 */

const HOST_NAMES = new Set(['globalThis','window','self','global','Storage','localStorage','sessionStorage']);

/** @param {AstNode} root @param {SourceType} sourceType @returns {{references:Reference[],at:(start:number)=>Reference|undefined}} */
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
  /** @type {{node:AstNode,scope:Scope}[]} */
  const evalCalls = [];
  let bindingCounter=0;

  /** @param {Scope} parent @param {string} kind @returns {Scope} */
  function child(parent,kind) {
    return {parent,kind,bindings:new Map(),uncertain:new Set(),directEval:false,dynamicWith:kind==='with'};
  }
  /** @param {Scope} scope @param {string} name @param {string} kind */
  function declare(scope,name,kind) {
    const existing=scope.bindings.get(name);
    if (existing) {
      if (kind==='var' && ['var','function'].includes(existing.kind)) return;
      scope.uncertain.add(name);
      return;
    }
    scope.bindings.set(name,{id:++bindingCounter,name,kind});
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
      case 'Identifier': declarations.add(node);declare(scope,node.name,kind);break;
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
    let scope=incoming;
    if(node!==root) {
      if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression') {
        // Function declarations bind in their containing lexical environment.
        if(node.type==='FunctionDeclaration' && node.id) {
          declarations.add(node.id);
          const outer = incoming;
          const isBlock=outer.kind==='block'||outer.kind==='switch'||outer.kind==='loop';
          if(isBlock&&sourceType!=='module') varScope(outer).uncertain.add(node.id.name); // Annex B
          declare(outer,node.id.name,isBlock?'block-function':'function');
        }
        scope=child(incoming,'function');
        if(node.type==='FunctionExpression'&&node.id)declarePattern(node.id,scope,'function-name');
        for(const param of node.params)declarePattern(param,scope,'param');
      }else if(node.type==='ClassDeclaration'||node.type==='ClassExpression'){
        if(node.type==='ClassDeclaration'&&node.id)declarePattern(node.id,incoming,'class');
        scope=child(incoming,'class');
        if(node.type==='ClassExpression'&&node.id)declarePattern(node.id,scope,'class-name');
      }else if(node.type==='BlockStatement'){
        // A non-simple formal parameter list has a parameter environment
        // separate from body var/function declarations. Default initializers
        // cannot resolve body-only vars, even when those vars are hoisted.
        const functionBody=parent && key==='body' &&
          ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(parent.type);
        const nonSimple=functionBody && parent.params.some(param=>param.type!=='Identifier');
        scope=child(incoming,nonSimple?'function-body':'block');
      }
      else if(node.type==='StaticBlock')scope=child(incoming,'static-block');
      else if(node.type==='CatchClause'){
        scope=child(incoming,'catch');
        declarePattern(node.param,scope,'catch');
      }else if(['ForStatement','ForInStatement','ForOfStatement'].includes(node.type))scope=child(incoming,'loop');
      else if(node.type==='SwitchStatement')scope=child(incoming,'switch');
      else if(node.type==='WithStatement')scope=child(incoming,'with');
    }
    scopes.set(node,scope);
    if(node.type==='VariableDeclaration'){
      for(const dec of node.declarations){
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

  /** @param {Scope} scope @param {string} name @returns {Binding|null} */
  function findBinding(scope,name){
    /** @type {Scope|null} */
    let s=scope;
    for(;s;s=s.parent){
      if(s.uncertain.has(name))return null;
      const b=s.bindings.get(name);if(b)return b;
    }
    return null;
  }
  // A direct eval can introduce names in its activation's environment, and
  // descendants created in that activation can observe those names.
  for(const entry of evalCalls){
    if(findBinding(entry.scope,'eval'))continue;
    varScope(entry.scope).directEval=true;
  }
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
    if(parent.type==='PrivateIdentifier')return false;
    return true;
  }
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors */
  function visit(node,parent,key,ancestors) {
    if(node.type==='Identifier' && isReference(node,parent,key,ancestors)){
      const scope=scopes.get(node);
      if(!scope)throw new Error('Missing lexical scope');
      references.push({node,name:node.name,start:node.start,end:node.end,resolution:resolve(scope,node.name)});
    }
    const next=[...ancestors,node];
    children(node,(c,k)=>visit(c,node,k,next));
  }
  visit(root,null,null,[]);
  return {references,at:(start)=>references.find(r=>r.start===start)};
}

module.exports={resolveLexicalReferences};
