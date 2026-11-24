'use strict';

const {resolveLexicalReferences}=require('./agent1-lexical-reference-resolver');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {'module'|'script'|'commonjs'} SourceType */
/** @typedef {{kind:'unknown-call'|'unresolved-local-call'|'new-expression'|'tagged-template'|'await'|'yield'|'dynamic-import'|'transitive-local-call'|'with-binding-lookup'|'implicit-iterator'|'implicit-object-enumeration'|'implicit-proxy-has'|'implicit-instanceof'|'implicit-delete'|'implicit-destructuring'|'implicit-spread'|'to-primitive'|'to-property-key'|'promise-thenable-assimilation'|'host-held-callable'|'classic-script-global-lexical',start:number,end:number,targetStart?:number,effect?:'DynamicFrame'|'HostHeldCallable'|'ExternalReachability'}} AmbientCallReason */
/** @typedef {{node:AstNode,start:number,end:number,bindingIds:number[],bindingNames:string[],ambient:boolean,dynamicFrame:boolean,hostHeldCallable:boolean,externallyReachable:boolean,safe:boolean,reasons:AmbientCallReason[]}} AmbientCallSummary */

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
 * A small primitive-expression recognizer for deciding whether an operation
 * can invoke ToPrimitive/ToPropertyKey user code. Unknown identifiers and
 * member reads remain unknown; this is not a value analysis.
 * @param {AstNode|null|undefined} node
 * @returns {boolean}
 */
function definitelyPrimitiveExpression(node) {
  if(!node)return false;
  switch(node.type) {
    case 'Literal': return !node.regex;
    case 'TemplateLiteral': return true;
    case 'UnaryExpression':
      if(['typeof','void','!'].includes(node.operator))return true;
      return ['+','-','~'].includes(node.operator)&&
        definitelyPrimitiveExpression(node.argument);
    case 'BinaryExpression':
      if(['in','instanceof'].includes(node.operator))return false;
      return definitelyPrimitiveExpression(node.left)&&
        definitelyPrimitiveExpression(node.right);
    case 'ConditionalExpression':
      return definitelyPrimitiveExpression(node.consequent)&&
        definitelyPrimitiveExpression(node.alternate);
    case 'SequenceExpression':
      return node.expressions.length>0&&
        definitelyPrimitiveExpression(node.expressions[node.expressions.length-1]);
    case 'ParenthesizedExpression':
      return definitelyPrimitiveExpression(node.expression);
    default: return false;
  }
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
 * @returns {{summaries:AmbientCallSummary[],ambientBindingIds:number[],hostHeldCallableBindingIds:number[],externallyReachableBindingIds:number[],unsafeBindingIds:number[],safeBindingIds:number[]}}
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

  /** @type {Map<AstNode,AstNode>} */
  const parentByNode=new Map();
  /** @type {Set<AstNode>} */
  const allFunctionNodes=new Set();
  walkAst(ast,(node,parent)=>{
    if(parent)parentByNode.set(node,parent);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))
      allFunctionNodes.add(node);
  });

  /** @type {Set<number>} */
  const writtenBindings=new Set();
  for(const reference of resolved.references) {
    if(reference.resolution.kind==='local' &&
       ['write','read-write'].includes(reference.role)) {
      writtenBindings.add(reference.resolution.bindingId);
    }
  }

  // A VariableDeclarator initializer is a runtime binding write even though
  // its identifier is correctly represented as a declaration, not a reference.
  // A same-ID var helper = callback can therefore overwrite a function declaration.
  /** @type {Set<number>} */
  const initializerOverwrittenFunctionBindings=new Set();
  for(const [bindingId,rows] of declarationsByBinding) {
    if(!rows.some(row=>row.kind==='function'))continue;
    for(const row of rows) {
      const parent=parentByNode.get(row.node);
      if(parent?.type==='VariableDeclarator'&&parent.init!==null)
        initializerOverwrittenFunctionBindings.add(bindingId);
    }
  }

  /** @type {Set<number>} */
  const topLevelScriptBindings=new Set();
  /** @type {Set<number>} */
  const mutableTopLevelScriptBindings=new Set();
  /** @type {Set<AstNode>} */
  const externallyReachableFunctions=new Set();
  if(sourceType==='script') {
    walkAst(ast,(node,parent)=>{
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&parent===ast) {
        externallyReachableFunctions.add(node);
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)topLevelScriptBindings.add(id);
      }
      if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
         parentByNode.get(parent)===ast&&node.id.type==='Identifier') {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null) {
          topLevelScriptBindings.add(id);
          if(parent.kind!=='const')mutableTopLevelScriptBindings.add(id);
        }
        if(node.init&&['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type))
          externallyReachableFunctions.add(node.init);
      }
    });
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
       initializerOverwrittenFunctionBindings.has(bindingId)||
       mutableTopLevelScriptBindings.has(bindingId)||
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
      // Top-level classic-script declarations are globally reachable; other
      // script declaration/Annex-B cases remain outside this single-AST donor.
      if(sourceType!=='script'||parent!==ast)
        addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='FunctionExpression'&&node.id?.type==='Identifier') {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
              parent.kind==='const'&&node.id.type==='Identifier'&&
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
  for(const fn of allFunctionNodes)nodeBindingIds.set(fn,new Set());
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
      if(topLevelScriptBindings.has(bindingId))externallyReachableFunctions.add(fn);
    }
  }
  if(sourceType==='script') {
    walkAst(ast,(node,parent)=>{
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&parent===ast) {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)nodeBindingIds.get(node)?.add(id);
      }
      if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
         parentByNode.get(parent)===ast&&node.id.type==='Identifier'&&node.init&&
         ['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type)) {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)nodeBindingIds.get(node.init)?.add(id);
      }
    });
  }

  /** @type {Map<AstNode,Array<{target:AstNode,start:number,end:number}>>} */
  const callEdges=new Map();
  /** @type {Set<AstNode>} */
  const dynamicFrameFunctions=new Set();
  /** @type {Set<AstNode>} */
  const hostHeldFunctions=new Set();
  /** @type {Map<AstNode,Map<string,AmbientCallReason>>} */
  const reasonsByFunction=new Map();
  /**
   * @param {AstNode} fn
   * @param {AmbientCallReason} reason
   * @param {'DynamicFrame'|'HostHeldCallable'|'ExternalReachability'} [effect]
   * @returns {void}
   */
  function addReason(fn,reason,effect='DynamicFrame') {
    const reasons=reasonsByFunction.get(fn)??new Map();
    const row={...reason,effect};
    const key=[effect,row.kind,row.start,row.end,row.targetStart??''].join(':');
    reasons.set(key,row);
    reasonsByFunction.set(fn,reasons);
    if(effect==='DynamicFrame')dynamicFrameFunctions.add(fn);
    else if(effect==='HostHeldCallable')hostHeldFunctions.add(fn);
  }

  for(const fn of externallyReachableFunctions)
    addReason(fn,{kind:'classic-script-global-lexical',start:fn.start,end:fn.end},'ExternalReachability');

  /** @param {AstNode} argument @returns {AstNode|null} */
  function callableForArgument(argument) {
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(argument.type))
      return argument;
    if(argument.type==='SpreadElement')return callableForArgument(argument.argument);
    if(argument.type==='Identifier') {
      const reference=resolved.at(argument.start);
      if(reference?.resolution.kind==='local')
        return resolveFunctionNode(reference.resolution.bindingId);
    }
    return null;
  }

  // An unknown host call can retain and stringify a callable argument without
  // invoking it. This value-escape effect is distinct from DynamicFrame.
  // This first cut follows direct identifiers, const aliases and inline
  // function arguments; aggregate/return/parameter flows remain Unknown.
  walkAst(ast,node=>{
    if(node.type==='CallExpression'||node.type==='NewExpression') {
      let knownLocalTarget=null;
      if(node.type==='CallExpression'&&!node.optional&&node.callee.type==='Identifier') {
        const reference=resolved.at(node.callee.start);
        if(reference?.resolution.kind==='local')
          knownLocalTarget=resolveFunctionNode(reference.resolution.bindingId);
      }
      if(!knownLocalTarget) {
        for(const argument of node.arguments) {
          const target=callableForArgument(argument);
          if(target)addReason(target,{kind:'host-held-callable',start:node.start,end:node.end},'HostHeldCallable');
        }
      }
    } else if(node.type==='TaggedTemplateExpression') {
      for(const expression of node.quasi.expressions) {
        const target=callableForArgument(expression);
        if(target)addReason(target,{kind:'host-held-callable',start:node.start,end:node.end},'HostHeldCallable');
      }
    }
  });

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
      } else if(node.type==='WithStatement') {
        addReason(fn,{kind:'with-binding-lookup',start:node.start,end:node.end});
      } else if(node.type==='ForOfStatement') {
        addReason(fn,{kind:'implicit-iterator',start:node.start,end:node.end});
      } else if(node.type==='ForInStatement') {
        addReason(fn,{kind:'implicit-object-enumeration',start:node.start,end:node.end});
      } else if(node.type==='ObjectPattern'||node.type==='ArrayPattern') {
        addReason(fn,{kind:'implicit-destructuring',start:node.start,end:node.end});
      } else if(node.type==='SpreadElement') {
        addReason(fn,{kind:'implicit-spread',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&node.operator==='in') {
        addReason(fn,{kind:'implicit-proxy-has',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&node.operator==='instanceof') {
        addReason(fn,{kind:'implicit-instanceof',start:node.start,end:node.end});
      } else if(node.type==='UnaryExpression'&&node.operator==='delete'&&
                node.argument.type==='MemberExpression') {
        addReason(fn,{kind:'implicit-delete',start:node.start,end:node.end});
      } else if(node.type==='MemberExpression'&&node.computed&&
                !definitelyPrimitiveExpression(node.property)) {
        addReason(fn,{kind:'to-property-key',start:node.start,end:node.end});
      } else if(node.type==='Property'&&node.computed&&
                !definitelyPrimitiveExpression(node.key)) {
        addReason(fn,{kind:'to-property-key',start:node.start,end:node.end});
      } else if(node.type==='TemplateLiteral'&&
                node.expressions.some((/** @type {AstNode} */ expression)=>
                  !definitelyPrimitiveExpression(expression))) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&
                !['in','instanceof'].includes(node.operator)&&
                (!definitelyPrimitiveExpression(node.left)||
                 !definitelyPrimitiveExpression(node.right))) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='UnaryExpression'&&['+','-','~'].includes(node.operator)&&
                !definitelyPrimitiveExpression(node.argument)) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='ReturnStatement'&&fn.async&&node.argument&&
                !definitelyPrimitiveExpression(node.argument)) {
        addReason(fn,{kind:'promise-thenable-assimilation',start:node.start,end:node.end});
      }
    });
    callEdges.set(fn,edges);
  }

  let changed=true;
  while(changed) {
    changed=false;
    for(const [caller,edges] of callEdges) {
      if(dynamicFrameFunctions.has(caller))continue;
      const edge=edges.find(candidate=>dynamicFrameFunctions.has(candidate.target));
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
    const dynamicFrame=dynamicFrameFunctions.has(fn);
    const hostHeldCallable=hostHeldFunctions.has(fn);
    const externallyReachable=externallyReachableFunctions.has(fn);
    return {
      node:fn,start:fn.start,end:fn.end,bindingIds,bindingNames,
      ambient:dynamicFrame,dynamicFrame,hostHeldCallable,externallyReachable,
      safe:!dynamicFrame&&!hostHeldCallable&&!externallyReachable,
      reasons:[...(reasonsByFunction.get(fn)?.values()??[])].sort((a,b)=>
        a.start-b.start||a.kind.localeCompare(b.kind))
    };
  });
  const ambientBindingIds=summaries.filter(summary=>summary.dynamicFrame)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const hostHeldCallableBindingIds=summaries.filter(summary=>summary.hostHeldCallable)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const externallyReachableBindingIds=summaries.filter(summary=>summary.externallyReachable)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const unsafeBindingIds=summaries.filter(summary=>!summary.safe)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const safeBindingIds=summaries.filter(summary=>summary.safe)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  return {summaries,ambientBindingIds,hostHeldCallableBindingIds,
    externallyReachableBindingIds,unsafeBindingIds,safeBindingIds};
}

module.exports={summarizeAmbientCallEffects};
