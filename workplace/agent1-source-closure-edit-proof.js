'use strict';

const {parse,walk,applyEdits}=require('../src/ast');
const {resolveLexicalReferences}=require('./agent1-lexical-reference-resolver');

/**
 * Read-only research proof for *one explicitly selected* source-observed named
 * function declaration and its local lexical closure. No inference of source
 * observers, host-native method identity, property flow, security, runtime
 * integrity, or general transformation validity is made here.
 *
 * @typedef {import('../src/ast').AstNode} AstNode
 * @typedef {import('../src/ast').Edit} Edit
 * @typedef {'module'|'script'|'commonjs'} SourceType
 * @typedef {'exact'|'frame'|'bytes'} Effect
 * @typedef {{start:number,end:number,reason:string}} GuardedSpan
 * @typedef {{start:number,end:number,source:string,guarded:GuardedSpan[],closureBindings:number[],declined:string|null}} SourceClosurePlan
 */

/**
 * Select a single named function declaration. Requiring exactly one is
 * deliberate: spelling alone cannot identify an ambiguous source-observed
 * function across reparse passes.
 * @param {AstNode} ast
 * @param {string} name
 * @returns {AstNode}
 */
function selectNamedFunction(ast,name) {
  /** @type {AstNode[]} */
  const matched=[];
  walk(ast,node=>{
    if(node.type==='FunctionDeclaration' && node.id?.type==='Identifier' &&
       node.id.name===name)matched.push(node);
  });
  if(matched.length!==1)throw new RangeError('Expected one named function declaration: '+name);
  return matched[0];
}

/**
 * Construct an ExactSource + lexical-binding protection manifest. A resolved
 * outer binding is protected at all declaration/reference identifier spans
 * whenever its name occurs in the selected callable. Protecting only the
 * callable body can break closures under otherwise source-preserving edits.
 * @param {string} source
 * @param {AstNode} ast
 * @param {SourceType} sourceType
 * @param {string} functionName
 * @returns {SourceClosurePlan}
 */
function planObservedFunctionSource(source,ast,sourceType,functionName){
  const fn=selectNamedFunction(ast,functionName);
  const analysis=resolveLexicalReferences(ast,sourceType);
  const selected=analysis.declarations.find(d=>d.node===fn.id);
  /** @type {GuardedSpan[]} */
  const guarded=[{start:fn.start,end:fn.end,reason:'ExactSource'}];
  /** @type {Set<number>} */
  const ids=new Set();
  if(selected?.bindingId===null||selected?.bindingId===undefined) {
    return {start:fn.start,end:fn.end,source:source.slice(fn.start,fn.end),
      guarded,closureBindings:[],declined:'selected-function-ambiguous-binding'};
  }
  ids.add(selected.bindingId);
  // Hidden class self-bindings have an independent runtime identity but no
  // independent source declaration token. This bounded proof cannot map
  // them through edits, so decline before advertising a successful plan.
  /** @type {Set<number>} */
  const sourceDeclarationIds=new Set();
  for(const declaration of analysis.declarations)
    if(declaration.bindingId!==null)sourceDeclarationIds.add(declaration.bindingId);
  for(const r of analysis.references) {
    if(r.start<fn.start||r.end>fn.end)continue;
    if(r.resolution.kind!=='local'){
      return {start:fn.start,end:fn.end,source:source.slice(fn.start,fn.end),
        guarded,closureBindings:[],declined:'unresolved-source-reference:'+r.name};
    }
    if(!sourceDeclarationIds.has(r.resolution.bindingId)){
      return {start:fn.start,end:fn.end,source:source.slice(fn.start,fn.end),
        guarded,closureBindings:[],declined:'unproved-hidden-binding:'+r.name};
    }
    ids.add(r.resolution.bindingId);
  }
  for(const decl of analysis.declarations){
    if(decl.bindingId!==null && ids.has(decl.bindingId)){
      guarded.push({start:decl.start,end:decl.end,reason:'LexicalDeclaration'});
    }
  }
  for(const ref of analysis.references){
    if(ref.resolution.kind==='local'&&ids.has(ref.resolution.bindingId)){
      guarded.push({start:ref.start,end:ref.end,reason:'LexicalReference'});
    }
  }
  return {start:fn.start,end:fn.end,source:source.slice(fn.start,fn.end),
    guarded,closureBindings:[...ids].sort((a,b)=>a-b),declined:null};
}

/** @param {Edit} edit @param {GuardedSpan} span @returns {boolean} */
function intersects(edit,span) {
  if(edit.start===edit.end)return edit.start>=span.start&&edit.start<=span.end;
  return edit.start<span.end&&edit.end>span.start;
}

/**
 * Experimental edit gate: reject edits overlapping exact source or captured
 * lexical IDs, reparse output and re-resolve each observed reference to the
 * same source-mapped declaration. The resulting source may have other
 * semantic changes (property flow, effects, metadata, etc.); this does not
 * certify a general-purpose JavaScript transformation.
 *
 * @param {string} source
 * @param {SourceType} sourceType
 * @param {string} functionName
 * @param {Edit[]} edits
 * @param {{effect?:Effect}} [options]
 * @returns {{code:string,plan:SourceClosurePlan}}
 */
function applyObservedFunctionEdits(source,sourceType,functionName,edits,options={}){
  const ast=parse(source,sourceType);
  const fn=selectNamedFunction(ast,functionName);
  const oldBindings=resolveLexicalReferences(ast,sourceType);
  const plan=planObservedFunctionSource(source,ast,sourceType,functionName);
  if(plan.declined)throw new TypeError('Unproven source observer closure: '+plan.declined);
  const effect=options.effect??'exact';
  if(!['exact','frame','bytes'].includes(effect))throw new TypeError('Unknown source effect');
  if(effect==='bytes'&&edits.length)throw new TypeError('SourceBytes requires byte-identical file');
  for(const e of edits){
    if(effect==='frame'&&e.start<=fn.start)throw new TypeError('FramePosition prefix cannot change');
    if(plan.guarded.some(span=>intersects(e,span)))
      throw new TypeError('Edit touches observed source or lexical closure');
  }
  // Reuse the repository's overlap/range validator; edit coordinates are
  // original UTF-16 code-unit offsets, identical to Acorn's node spans.
  const code=applyEdits(source,edits);
  /** @param {number} oldOffset @returns {number} */
  function mapped(oldOffset){
    let delta=0;
    for(const e of edits)if(e.end<=oldOffset)
      delta+=e.text.length-(e.end-e.start);
    return oldOffset+delta;
  }
  const result=parse(code,sourceType);
  const newFn=selectNamedFunction(result,functionName);
  if(newFn.start!==mapped(fn.start)||newFn.end!==mapped(fn.end)||
     code.slice(newFn.start,newFn.end)!==plan.source)
    throw new TypeError('Observed callable source moved or changed unexpectedly');
  const newBindings=resolveLexicalReferences(result,sourceType);
  for(const oldRef of oldBindings.references){
    if(oldRef.start<fn.start||oldRef.end>fn.end)continue;
    const oldBindingId=oldRef.resolution.kind==='local'?
      oldRef.resolution.bindingId:null;
    if(oldBindingId===null)
      throw new TypeError('Observed callable has an unresolved reference');
    const fresh=newBindings.references.find(r=>r.start===mapped(oldRef.start)&&
      r.name===oldRef.name);
    const nextBindingId=fresh?.resolution.kind==='local'?
      fresh.resolution.bindingId:null;
    if(nextBindingId===null)
      throw new TypeError('Observed callable lexical binding became unresolved');
    const oldDecls=oldBindings.declarations.filter(d=>
      d.bindingId===oldBindingId);
    if(!oldDecls.length)throw new TypeError('Missing source binding declaration');
    for(const oldDecl of oldDecls){
      const nextDecl=newBindings.declarations.find(d=>
        d.start===mapped(oldDecl.start)&&d.name===oldDecl.name);
      if(nextDecl?.bindingId===null || nextDecl?.bindingId===undefined ||
         nextDecl.bindingId!==nextBindingId)
        throw new TypeError('Source-visible closure binding identity changed');
    }
  }
  return {code,plan};
}

module.exports={planObservedFunctionSource,applyObservedFunctionEdits};
