'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');

/** @typedef {[number,number][][]} WeightedAliases */

/**
 * Existing path-local graph evaluation for max statically bound arguments.
 * @param {WeightedAliases} graph
 * @param {number} node
 * @param {Set<number>} [active]
 * @returns {number}
 */
function original(graph,node,active=new Set()){
  if(active.has(node))return 0;
  active.add(node);
  let best=0;
  for(const [child,weight] of graph[node])
    best=Math.max(best,weight+original(graph,child,active));
  active.delete(node);
  return best;
}

/**
 * Memoize only if no descendant returns through the recursion stack.
 * Backedges mark every active ancestor context-dependent. A fresh memo is
 * created for each independent root query and all edge weights are retained.
 * @param {WeightedAliases} graph
 * @param {number} node
 * @param {Set<number>} [active]
 * @param {Map<number,number>} [memo]
 * @param {Set<number>} [cycleAffected]
 * @returns {number}
 */
function candidate(graph,node,active=new Set(),memo=new Map(),cycleAffected=new Set()){
  if(active.has(node)){
    for(const ancestor of active)cycleAffected.add(ancestor);
    return 0;
  }
  if(memo.has(node))return memo.get(node)??0;
  active.add(node);
  let best=0;
  for(const [child,weight] of graph[node])
    best=Math.max(best,weight+candidate(graph,child,active,memo,cycleAffected));
  active.delete(node);
  if(!cycleAffected.has(node))memo.set(node,best);
  return best;
}

/**
 * Independent iterative enumeration of all simple-path prefixes. A backedge
 * contributes its weight once, then terminates, matching the original cutoff.
 * @param {WeightedAliases} graph
 * @param {number} root
 * @returns {number}
 */
function enumerated(graph,root){
  const frames=[{node:root,weight:0,seen:new Set([root])}];
  let maxWeight=0;
  while(frames.length){
    const frame=frames.pop();
    assert.ok(frame);
    maxWeight=Math.max(maxWeight,frame.weight);
    for(const [child,weight] of graph[frame.node]){
      const nextWeight=frame.weight+weight;
      if(frame.seen.has(child)){
        maxWeight=Math.max(maxWeight,nextWeight);
        continue;
      }
      const seen=new Set(frame.seen);
      seen.add(child);
      frames.push({node:child,weight:nextWeight,seen});
    }
  }
  return maxWeight;
}

test('weighted cyclic alias DAG memoization matches legacy and enumerated maxima',()=>{
  let state=0x05ab17e4;
  /** @returns {number} */
  function random(){
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  }
  let queries=0;
  for(let i=0;i<20000;i++){
    const size=1+random()%12;
    /** @type {WeightedAliases} */
    const graph=Array.from({length:size},()=>[]);
    for(let node=0;node<size;node++){
      const count=random()%3;
      for(let k=0;k<count;k++)graph[node].push([random()%size,random()%4]);
    }
    for(let root=0;root<size;root++){
      const expected=enumerated(graph,root);
      assert.equal(original(graph,root),expected,'legacy case '+i+' root '+root);
      assert.equal(candidate(graph,root),expected,'candidate case '+i+' root '+root);
      queries++;
    }
  }
  assert.ok(queries>100000,'Corpus must exercise many independent root queries');
  console.log('BOUND_OBJECT_CREATE_MODEL '+JSON.stringify({
    graphs:20000,queries,seed:0x05ab17e4
  }));
});

test('all three-identifier directed 0/1-weight alias graphs preserve maxima',()=>{
  let queries=0;
  // Nine possible directed edges, each absent or carrying bound weight 0/1.
  for(let mask=0;mask<3**9;mask++){
    /** @type {WeightedAliases} */
    const graph=[[],[],[]];
    let digits=mask;
    for(let source=0;source<3;source++)for(let dest=0;dest<3;dest++){
      const digit=digits%3;
      digits=Math.floor(digits/3);
      if(digit)graph[source].push([dest,digit-1]);
    }
    for(let root=0;root<3;root++){
      const expected=enumerated(graph,root);
      assert.equal(original(graph,root),expected,'legacy mask '+mask);
      assert.equal(candidate(graph,root),expected,'candidate mask '+mask);
      queries++;
    }
  }
  assert.equal(queries,59049);
});

test('diamond weighted maxima remain unchanged',()=>{
  /** @type {WeightedAliases} */
  const graph=Array.from({length:33},()=>[]);
  graph[0]=[[1,1],[2,1]];
  for(let level=1;level<16;level++){
    const previous=1+2*(level-1);
    const left=1+2*level;
    const right=left+1;
    graph[previous]=[[left,1],[right,1]];
    graph[previous+1]=[[left,1],[right,1]];
  }
  assert.equal(original(graph,0),16);
  assert.equal(candidate(graph,0),16);
  assert.equal(enumerated(graph,0),16);
});
