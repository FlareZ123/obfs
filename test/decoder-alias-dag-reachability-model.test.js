'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');

/** @typedef {{reached:boolean,calls:number}} Traversal */

/**
 * Original path-local cycle check. Each completed branch removes its current
 * identifier, revisiting shared successors through other predecessor paths.
 * @param {number[][]} edges
 * @param {boolean[]} sensitive
 * @param {number} root
 * @returns {Traversal}
 */
function pathLocal(edges,sensitive,root) {
  const active=new Set();
  let calls=0;
  /** @param {number} node @returns {boolean} */
  function visit(node) {
    calls++;
    if(active.has(node))return false;
    active.add(node);
    if(sensitive[node])return true;
    for(const child of edges[node])if(visit(child))return true;
    active.delete(node);
    return false;
  }
  return {reached:visit(root),calls};
}

/**
 * Candidate query-local memoization. The visited set is fresh per root query.
 * @param {number[][]} edges
 * @param {boolean[]} sensitive
 * @param {number} root
 * @returns {Traversal}
 */
function queryLocal(edges,sensitive,root) {
  const seen=new Set();
  let calls=0;
  /** @param {number} node @returns {boolean} */
  function visit(node) {
    calls++;
    if(seen.has(node))return false;
    seen.add(node);
    if(sensitive[node])return true;
    for(const child of edges[node])if(visit(child))return true;
    return false;
  }
  return {reached:visit(root),calls};
}

/**
 * Independent iterative oracle.
 * @param {number[][]} edges
 * @param {boolean[]} sensitive
 * @param {number} root
 * @returns {boolean}
 */
function breadthFirst(edges,sensitive,root) {
  const seen=new Set([root]);
  const queue=[root];
  for(let i=0;i<queue.length;i++){
    const node=queue[i];
    if(sensitive[node])return true;
    for(const next of edges[node])if(!seen.has(next)){
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

test('seeded cyclic alias graph model matches independent BFS across 10000 cases',()=>{
  const seed=0x5a1a5d00;
  let state=seed;
  /** @returns {number} */
  function next(){
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  }
  let queries=0;
  let maxPathCalls=0;
  let maxMemoCalls=0;
  for(let caseIndex=0;caseIndex<10000;caseIndex++){
    const size=1+next()%15;
    /** @type {number[][]} */
    const edges=Array.from({length:size},()=>[]);
    /** @type {boolean[]} */
    const sensitive=Array.from({length:size},()=>false);
    for(let node=0;node<size;node++){
      const fanout=next()%3;
      for(let k=0;k<fanout;k++)edges[node].push(next()%size);
      sensitive[node]=next()%11===0;
    }
    const roots=[0,next()%size];
    for(const root of roots){
      const original=pathLocal(edges,sensitive,root);
      const revised=queryLocal(edges,sensitive,root);
      const independent=breadthFirst(edges,sensitive,root);
      assert.equal(original.reached,independent,'old DFS case '+caseIndex);
      assert.equal(revised.reached,independent,'new DFS case '+caseIndex);
      maxPathCalls=Math.max(maxPathCalls,original.calls);
      maxMemoCalls=Math.max(maxMemoCalls,revised.calls);
      queries++;
    }
  }
  assert.equal(queries,20000);
  console.log('ALIAS_DAG_GRAPH_MODEL '+
    JSON.stringify({seed,cases:10000,queries,maxPathCalls,maxMemoCalls}));
});

test('directed diamond requires exponentially repeated path-local DFS calls',()=>{
  // Root followed by two merged identifiers at each of sixteen levels.
  /** @type {number[][]} */
  const edges=Array.from({length:33},()=>[]);
  edges[0]=[1,2];
  for(let level=1;level<16;level++){
    const previous=1+2*(level-1);
    const left=1+2*level;
    const right=left+1;
    edges[previous]=[left,right];
    edges[previous+1]=[left,right];
  }
  const sensitive=Array.from({length:edges.length},()=>false);
  const original=pathLocal(edges,sensitive,0);
  const revised=queryLocal(edges,sensitive,0);
  assert.equal(breadthFirst(edges,sensitive,0),false);
  assert.deepEqual(original,{reached:false,calls:131071});
  assert.deepEqual(revised,{reached:false,calls:63});
});
