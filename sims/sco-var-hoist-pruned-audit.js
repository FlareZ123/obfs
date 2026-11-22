'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {parse,walk}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Collect variable bindings in an ESTree pattern; computed keys and default
 * expressions contribute no declarations.
 * @param {AstNode|null|undefined} pattern
 * @param {Set<string>} names
 * @returns {void}
 */
function patternNames(pattern,names){
  if(!pattern)return;
  if(pattern.type==='Identifier'){names.add(pattern.name);return;}
  if(pattern.type==='RestElement'){patternNames(pattern.argument,names);return;}
  if(pattern.type==='AssignmentPattern'){patternNames(pattern.left,names);return;}
  if(pattern.type==='ArrayPattern'){
    for(const element of pattern.elements)patternNames(element,names);
  }
  if(pattern.type==='ObjectPattern'){
    for(const property of pattern.properties){
      patternNames(property.type==='RestElement'?property.argument:property.value,names);
    }
  }
}

/**
 * The historical, full-subtree walker that rejects nested environment
 * declarations after visiting their AST nodes. Retained only as a test oracle.
 * @param {AstNode} scope
 * @returns {Set<string>}
 */
function previousHoists(scope){
  const body=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
    .includes(scope.type)?scope.body:scope;
  const names=new Set();
  walk(body,(node,_parent,_key,ancestors)=>{
    if(node.type!=='VariableDeclaration'||node.kind!=='var')return;
    if(ancestors.some(ancestor=>ancestor!==body&&
      ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
        'StaticBlock'].includes(ancestor.type)))return;
    for(const entry of node.declarations)patternNames(entry.id,names);
  });
  return names;
}

/**
 * Current scope-pruned iterative walker. Compare this independent copy against
 * the production implementation when changing src/sco-free-references.js.
 * @param {AstNode} scope
 * @returns {Set<string>}
 */
function prunedHoists(scope){
  const body=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
    .includes(scope.type)?scope.body:scope;
  const names=new Set();
  /** @type {AstNode[]} */
  const todo=[body];
  while(todo.length){
    const node=todo.pop();
    if(!node)continue;
    if(node!==body&&['FunctionDeclaration','FunctionExpression',
      'ArrowFunctionExpression','StaticBlock'].includes(node.type))continue;
    if(node.type==='VariableDeclaration'&&node.kind==='var'){
      for(const entry of node.declarations)patternNames(entry.id,names);
    }
    for(const [key,value] of Object.entries(node)){
      if(key==='parent'||key==='comments')continue;
      if(Array.isArray(value)){
        for(const item of value){
          if(item&&typeof item==='object'&&typeof item.type==='string')todo.push(item);
        }
      }else if(value&&typeof value==='object'&&typeof value.type==='string'){
        todo.push(value);
      }
    }
  }
  return names;
}

/** Deterministic 32-bit LCG for reproducible fixture selection. */
let seed=0x4f2a1bc0;
/** @param {number} upper @returns {number} */
function pick(upper){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed%upper;
}

/** @param {number} depth @param {number} id @returns {string} */
function block(depth,id){
  const count=pick(depth>3?2:4);
  return Array.from({length:count},(_,index)=>statement(depth,id*7+index+1)).join('');
}

/** @param {number} depth @param {number} id @returns {string} */
function statement(depth,id){
  const key='v'+id;
  /** @type {Array<()=>string>} */
  const variants=[
    ()=>`var ${key}=${id};`,
    ()=>`var {${key}}={${key}:${id}};`,
    ()=>`{${block(depth+1,id*3+1)}}`,
    ()=>`if(false){${block(depth+1,id*3+2)}}else{var ${key}=${id};}`,
    ()=>`try{${block(depth+1,id*3+3)}}finally{}`,
    ()=>`for(var ${key}=0;${key}<0;${key}++){${block(depth+1,id*3+4)}}`,
    ()=>`switch(0){case 1:${block(depth+1,id*3+5)}}`,
    ()=>`function f${id}(){${block(depth+1,id*3+6)}}`,
    ()=>`class C${id}{static {${block(depth+1,id*3+7)}}}`
  ];
  return variants[pick(depth>3?2:variants.length)]();
}

/** @param {number} depth @returns {string} */
function nestedSource(depth){
  const open=Array.from({length:depth},(_,index)=>`function f${index}(){`).join('');
  return 'export async function selected(){var v=31;'+open+'return v;'+
    '}'.repeat(depth)+'return v;}';
}

/** @param {number} depth @returns {AstNode} */
function nestedBody(depth){
  const ast=parse(nestedSource(depth),'module');
  return ast.body[0].declaration.body;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return Number(((sorted[3]+sorted[4])/2).toFixed(3));
}

/**
 * @param {number} depth
 * @returns {{
 *   depth:number,scopes:number,previous_ms:number[],
 *   pruned_ms:number[],previous_median_ms:number,pruned_median_ms:number
 * }}
 */
function bench(depth){
  const source=nestedSource(depth);
  const ast=parse(source,'module');
  /** @type {AstNode[]} */
  const scopes=[];
  walk(ast,node=>{
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
      .includes(node.type))scopes.push(node);
  });
  /** @param {(scope:AstNode)=>Set<string>} run @returns {number} */
  function elapsed(run){
    const start=performance.now();
    for(const scope of scopes)run(scope);
    return Number((performance.now()-start).toFixed(3));
  }
  const previous_ms=[];
  const pruned_ms=[];
  // Warm both visitors before alternating measurement order. A/B is one
  // parsed fixture, no parser or module-loader time included.
  elapsed(previousHoists);
  elapsed(prunedHoists);
  for(let pair=0;pair<8;pair++){
    if(pair%2===0){
      previous_ms.push(elapsed(previousHoists));
      pruned_ms.push(elapsed(prunedHoists));
    }else{
      pruned_ms.push(elapsed(prunedHoists));
      previous_ms.push(elapsed(previousHoists));
    }
  }
  return {depth,scopes:scopes.length,previous_ms,pruned_ms,
    previous_median_ms:median(previous_ms),
    pruned_median_ms:median(pruned_ms)};
}

function main(){
  let compared=0;
  for(let trial=0;trial<400;trial++){
    const ast=parse(`function top${trial}(){${block(0,trial+1)}}`,'module');
    /** @type {AstNode[]} */
    const scopes=[ast];
    walk(ast,node=>{
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
        'StaticBlock'].includes(node.type))scopes.push(node);
    });
    for(const scope of scopes){
      assert.deepEqual([...prunedHoists(scope)].sort(),[...previousHoists(scope)].sort(),
        `trial ${trial}, scope ${scope.type}`);
      compared++;
    }
  }
  for(const depth of [32,128,256]){
    assert.equal(firstUnprovedFreeReference(nestedBody(depth),new Set(),new Set(),
      new Set(),true),null,`production positive depth ${depth}`);
  }
  const costs=[80,160,320,640].map(bench);
  console.log(JSON.stringify({
    seed:'0x4f2a1bc0',fixtures:400,scope_comparisons:compared,
    tested_production_depths:[32,128,256],node:process.version,
    method:'eight alternating previous/pruned pairs after warmup; AST parsing excluded',
    costs
  },null,2));
}

main();
