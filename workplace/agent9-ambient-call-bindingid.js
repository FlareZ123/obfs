'use strict';

const {resolveLexicalReferences}=require('./agent1-lexical-reference-resolver');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {'module'|'script'|'commonjs'} SourceType */
/** @typedef {{kind:'unknown-call'|'unresolved-local-call'|'new-expression'|'tagged-template'|'await'|'yield'|'dynamic-import'|'transitive-local-call',start:number,end:number,targetStart?:number}} AmbientCallReason */
/** @typedef {{node:AstNode,start:number,end:number,bindingIds:number[],bindingNames:string[],ambient:boolean,reasons:AmbientCallReason[]}} AmbientCallSummary */

/**
 * @param {unknown} value
 * @returns {value is AstNode}
 */
function isAstNode(value) {
  return Boolean(value && typeof value==='object' &&
    typeof /** @type {{type?:unknown}} */ (value).type==='string');
}

/**
 * Walk an Acorn tree without relying on identifier spellings or parent
 * properties. The resolver's declaration-node BindingIds remain authoritative.
 * @param {AstNode} root
 * @param {(node:AstNode,parent:AstNode|null,key:string|null)=>void} visitor
 * @returns {void}
 */
function walkAst(root,visitor) {
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key */
  function visit(node,parent,key) {
    visitor(node,parent,key);
    for(const [childKey,value] of Object.entries(node)) {
      if(childKey==='parent'||childKey==='comments')continue;
      if(Array.isArray(value)) {
        for(const child of value)if(isAstNode(child))visit(child,node,childKey);
      } else if(isAstNode(value))visit(value,node,childKey);
    }
  }
  visit(root,null,null);
}

/**
 * Visit only executable syntax belonging to one function. A nested function
 * is summarized separately and reaches this function only through a resolved
 * local call edge.
 * @param {AstNode} root
 * @param {(node:AstNode)=>void} visitor
 * @returns {void}
 */
function walkExecutableFunctionBody(root,visitor) {
  /** @param {AstNode} node */
  function visit(node) {
    if(node!==root&&[
      'FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'
    ].includes(node.type))return;
    visitor(node);
    for(const value of Object.values(node)) {
      if(Array.isArray(value)) {
        for(const child of value)if(isAstNode(child))visit(child);
      } else if(isAstNode(value))visit(value);
    }
  }
  visit(root);
}

/**
 * Build a research-only ambient caller/stack effect summary using Agent 1's
 * read-only lexical BindingIds. It recognizes only direct local function
 * declarations, const-bound function expressions, and immutable const
 * identifier aliases. Every other call target is ambient/unknown.
 *
 * This summary is deliberately narrower than a complete host-effect model:
 * it does not analyze property getters, Proxy traps, Web IDL, primitive
 * prototype reads, cross-file imported function bodies, or error-stack
 * observation. It is not transform authorization.
 *
 * @param {AstNode} ast
 * @param {SourceType} sourceType
 * @returns {{summaries:AmbientCallSummary[],ambientBindingIds:number[],safeBindingIds:number[]}}
 */
function summarizeAmbientCallEffects(ast,sourceType) {
  const resolved=resolveLexicalReferences(ast,sourceType);
  /** @type {Map<AstNode,typeof resolved.declarations[number]>} */
  const declarationByNode=new Map();
  /** @type {Map<number,typeof resolved.declarations>} */
  const declarationsByBinding=new Map();
  for(const declaration of resolved.declarations) {
    declarationByNode.set(declaration.node,declaration);
    if(declaration.bindingId!==null) {
      const rows=declarationsByBinding.get(declaration.bindingId)??[];
      rows.push(declaration);
      declarationsByBinding.set(declaration.bindingId,rows);
    }
  }

  /** @type {Set<number>} */
  const writtenBindings=new Set();
  for(const reference of resolved.references) {
    if(reference.resolution.kind==='local' &&
       ['write','read-write'].includes(reference.role)) {
      writtenBindings.add(reference.resolution.bindingId);
    }
  }

  /** @type {Map<number,AstNode>} */
  const functionNodeByBinding=new Map();
  /** @type {Set<number>} */
  const ambiguousFunctionBindings=new Set();
  /**
   * @param {number|null} bindingId
   * @param {AstNode} fn
   * @returns {void}
   */
  function addFunctionBinding(bindingId,fn) {
    if(bindingId===null||writtenBindings.has(bindingId)||
       ambiguousFunctionBindings.has(bindingId))return;
    const existing=functionNodeByBinding.get(bindingId);
    if(existing&&existing!==fn) {
      functionNodeByBinding.delete(bindingId);
      ambiguousFunctionBindings.add(bindingId);
      return;
    }
    functionNodeByBinding.set(bindingId,fn);
  }

  /** @type {Map<number,number>} */
  const aliasTargets=new Map();
  walkAst(ast,(node,parent)=>{
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='FunctionExpression'&&node.id?.type==='Identifier') {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='VariableDeclarator'&&
              node.id.type==='Identifier'&&
              (node.init?.type==='FunctionExpression'||
               node.init?.type==='ArrowFunctionExpression')) {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node.init);
    }
    if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
       parent.kind==='const'&&node.id.type==='Identifier'&&
       node.init?.type==='Identifier') {
      const aliasBinding=declarationByNode.get(node.id)?.bindingId??null;
      const sourceReference=resolved.at(node.init.start);
      if(aliasBinding!==null&&!writtenBindings.has(aliasBinding)&&
         sourceReference?.resolution.kind==='local') {
        aliasTargets.set(aliasBinding,sourceReference.resolution.bindingId);
      }
    }
  });

  /**
   * Resolve a local binding or const alias to one uniquely known function.
   * @param {number} bindingId
   * @param {Set<number>} [seen]
   * @returns {AstNode|null}
   */
  function resolveFunctionNode(bindingId,seen=new Set()) {
    if(ambiguousFunctionBindings.has(bindingId))return null;
    const direct=functionNodeByBinding.get(bindingId);
    if(direct)return direct;
    if(seen.has(bindingId))return null;
    const target=aliasTargets.get(bindingId);
    if(target===undefined)return null;
    const next=new Set(seen);
    next.add(bindingId);
    return resolveFunctionNode(target,next);
  }

  /** @type {Map<AstNode,Set<number>>} */
  const nodeBindingIds=new Map();
  for(const [bindingId,fn] of functionNodeByBinding) {
    const ids=nodeBindingIds.get(fn)??new Set();
    ids.add(bindingId);
    nodeBindingIds.set(fn,ids);
  }
  for(const bindingId of aliasTargets.keys()) {
    const fn=resolveFunctionNode(bindingId);
    if(fn) {
      const ids=nodeBindingIds.get(fn)??new Set();
      ids.add(bindingId);
      nodeBindingIds.set(fn,ids);
    }
  }

  /** @type {Map<AstNode,Array<{target:AstNode,start:number,end:number}>>} */
  const callEdges=new Map();
  /** @type {Set<AstNode>} */
  const ambientFunctions=new Set();
  /** @type {Map<AstNode,Map<string,AmbientCallReason>>} */
  const reasonsByFunction=new Map();
  /**
   * @param {AstNode} fn
   * @param {AmbientCallReason} reason
   * @returns {void}
   */
  function addReason(fn,reason) {
    const reasons=reasonsByFunction.get(fn)??new Map();
    const key=[reason.kind,reason.start,reason.end,reason.targetStart??''].join(':');
    reasons.set(key,reason);
    reasonsByFunction.set(fn,reasons);
    ambientFunctions.add(fn);
  }

  for(const fn of nodeBindingIds.keys()) {
    /** @type {Array<{target:AstNode,start:number,end:number}>} */
    const edges=[];
    walkExecutableFunctionBody(fn,node=>{
      if(node.type==='CallExpression') {
        if(!node.optional&&node.callee.type==='Identifier') {
          const reference=resolved.at(node.callee.start);
          if(reference?.resolution.kind==='local') {
            const target=resolveFunctionNode(reference.resolution.bindingId);
            if(target)edges.push({target,start:node.start,end:node.end});
            else addReason(fn,{kind:'unresolved-local-call',start:node.start,end:node.end});
          } else {
            addReason(fn,{kind:'unknown-call',start:node.start,end:node.end});
          }
        } else {
          addReason(fn,{kind:'unknown-call',start:node.start,end:node.end});
        }
      } else if(node.type==='NewExpression') {
        addReason(fn,{kind:'new-expression',start:node.start,end:node.end});
      } else if(node.type==='TaggedTemplateExpression') {
        addReason(fn,{kind:'tagged-template',start:node.start,end:node.end});
      } else if(node.type==='AwaitExpression') {
        addReason(fn,{kind:'await',start:node.start,end:node.end});
      } else if(node.type==='YieldExpression') {
        addReason(fn,{kind:'yield',start:node.start,end:node.end});
      } else if(node.type==='ImportExpression') {
        addReason(fn,{kind:'dynamic-import',start:node.start,end:node.end});
      }
    });
    callEdges.set(fn,edges);
  }

  let changed=true;
  while(changed) {
    changed=false;
    for(const [caller,edges] of callEdges) {
      if(ambientFunctions.has(caller))continue;
      const edge=edges.find(candidate=>ambientFunctions.has(candidate.target));
      if(edge) {
        addReason(caller,{
          kind:'transitive-local-call',start:edge.start,end:edge.end,
          targetStart:edge.target.start
        });
        changed=true;
      }
    }
  }

  const summaries=[...nodeBindingIds.keys()].sort((a,b)=>a.start-b.start).map(fn=>{
    const bindingIds=[...(nodeBindingIds.get(fn)??[])].sort((a,b)=>a-b);
    const bindingNames=[...new Set(bindingIds.flatMap(id=>
      (declarationsByBinding.get(id)??[]).map(declaration=>declaration.name)))].sort();
    return {
      node:fn,start:fn.start,end:fn.end,bindingIds,bindingNames,
      ambient:ambientFunctions.has(fn),
      reasons:[...(reasonsByFunction.get(fn)?.values()??[])].sort((a,b)=>
        a.start-b.start||a.kind.localeCompare(b.kind))
    };
  });
  const ambientBindingIds=summaries.filter(summary=>summary.ambient)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const safeBindingIds=summaries.filter(summary=>!summary.ambient)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  return {summaries,ambientBindingIds,safeBindingIds};
}

module.exports={summarizeAmbientCallEffects};
