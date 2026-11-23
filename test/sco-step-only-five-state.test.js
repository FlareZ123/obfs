'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeIndependentMachine}=require('../sims/sco-sync-independent-distribution');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');
const {FIVE_STATE_MODEL_COUNT,canonicalTransitionCount,generateCanonicalTransitions,
  createFiveStateWorkspace}=require('../sims/sco-step-only-five-state');
const {learnBoundedStepOnly}=require('../sims/sco-step-only-version-space');

/** @param {{next:number[][],output:number[][]}} model @returns {number} */
function reachableCount(model){
  const seen=new Set([0]);
  const queue=[0];
  for(let index=0;index<queue.length;index++)for(let symbol=0;symbol<2;symbol++){
    const next=model.next[queue[index]][symbol];
    if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  return seen.size;
}

/**
 * Compare rooted machines through a disjoint union and an independent
 * fixed-point partition-refinement implementation.
 * @param {{next:number[][],output:number[][],state:number}} left
 * @param {{next:number[][],output:number[][],state:number}} right
 * @returns {boolean}
 */
function equivalentFromStates(left,right){
  const offset=left.next.length;
  const next=[
    ...left.next.map(row=>row.slice()),
    ...right.next.map(row=>row.map(state=>state+offset))
  ];
  const output=[
    ...left.output.map(row=>row.slice()),
    ...right.output.map(row=>row.slice())
  ];
  const classes=observableStateClasses({next,output});
  return classes[left.state]===classes[offset+right.state];
}

/** @param {number} seed @param {number} count @returns {number[][]} */
function heldoutWords(seed,count){
  let random=seed>>>0;
  /** @type {number[][]} */
  const words=[];
  for(let index=0;index<count;index++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%60);
    /** @type {number[]} */
    const word=[];
    for(let offset=0;offset<length;offset++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)&1);
    }
    words.push(word);
  }
  return words;
}

/**
 * @param {{next:number[][],output:number[][],state:number}} model
 * @param {readonly number[]} word
 * @returns {number[]}
 */
function traceFrom(model,word){
  let state=model.state;
  /** @type {number[]} */
  const outputs=[];
  for(const symbol of word){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}

/**
 * Encode up to ten 3-bit transition targets into an exact 30-bit numeric key.
 * @param {ArrayLike<number>} table
 * @returns {number}
 */
function encodeTransitionTable(table){
  let key=0;
  for(let index=0;index<table.length;index++)key|=table[index]<<(3*index);
  return key>>>0;
}

/**
 * Canonicalize a labelled reachable transition graph by ordered-input BFS.
 * Returns null when not all states are reachable.
 * @param {number} states
 * @param {Uint8Array} table
 * @returns {Uint8Array|null}
 */
function canonicalizeReachableTransitionGraph(states,table){
  const labels=new Int8Array(states);
  labels.fill(-1);
  labels[0]=0;
  const order=new Uint8Array(states);
  order[0]=0;
  const canonical=new Uint8Array(states*2);
  let discovered=1;
  for(let source=0;source<discovered;source++){
    const originalSource=order[source];
    for(let symbol=0;symbol<2;symbol++){
      const target=table[originalSource*2+symbol];
      if(labels[target]===-1){
        labels[target]=discovered;
        order[discovered]=target;
        discovered++;
      }
      canonical[source*2+symbol]=labels[target];
    }
  }
  return discovered===states?canonical:null;
}

test('canonical reachable transition enumeration is unique, reachable and complete',()=>{
  assert.deepEqual([1,2,3,4,5].map(canonicalTransitionCount),
    [1,12,216,5248,160675]);
  assert.equal(FIVE_STATE_MODEL_COUNT,165888708);
  assert.throws(()=>canonicalTransitionCount(6),RangeError);
  assert.throws(()=>generateCanonicalTransitions(6),RangeError);

  const generatedFive=generateCanonicalTransitions(5);
  assert.equal(generatedFive.count,160675);
  assert.equal(generatedFive.transitions.length,160675*10);
  const fiveKeys=new Set();
  for(let graph=0;graph<generatedFive.count;graph++){
    const table=generatedFive.transitions.subarray(graph*10,graph*10+10);
    const key=encodeTransitionTable(table);
    assert.equal(fiveKeys.has(key),false,'duplicate five-state canonical graph');
    fiveKeys.add(key);
    const seen=new Uint8Array(5);
    seen[0]=1;
    const queue=[0];
    for(let head=0;head<queue.length;head++){
      const state=queue[head];
      for(let symbol=0;symbol<2;symbol++){
        const target=table[state*2+symbol];
        if(seen[target]===0){seen[target]=1;queue.push(target);}
      }
    }
    assert.equal(queue.length,5,'generated five-state graph is not fully reachable');
  }
  assert.equal(fiveKeys.size,160675);

  const generatedFour=generateCanonicalTransitions(4);
  const fourKeys=new Set();
  for(let graph=0;graph<generatedFour.count;graph++){
    const key=encodeTransitionTable(
      generatedFour.transitions.subarray(graph*8,graph*8+8));
    assert.equal(fourKeys.has(key),false,'duplicate four-state canonical graph');
    fourKeys.add(key);
  }
  const observedFourKeys=new Set();
  const labelled=new Uint8Array(8);
  let reachableLabelled=0;
  for(let code=0;code<65536;code++){
    for(let edge=0;edge<8;edge++)labelled[edge]=(code>>>(2*edge))&3;
    const canonical=canonicalizeReachableTransitionGraph(4,labelled);
    if(canonical){
      reachableLabelled++;
      observedFourKeys.add(encodeTransitionTable(canonical));
    }
  }
  assert.equal(reachableLabelled,31488);
  assert.equal(observedFourKeys.size,generatedFour.count);
  for(const key of fourKeys)assert.equal(observedFourKeys.has(key),true,
    'generated four-state canonical graph absent from exhaustive labelled enumeration');
});

test('canonical five-state learner certifies minimal five-state and padded four-state oracles',async()=>{
  const workspace=createFiveStateWorkspace();
  const backing=workspace.ids;
  const fixtures=[
    {name:'random-five',model:makeIndependentMachine(0x42f5a7c9,5),states:5},
    {name:'delayed-five',model:{
      next:[[1,0],[2,0],[3,0],[4,0],[4,0]],
      output:[[0,0],[0,0],[0,0],[1,0],[0,0]]
    },states:5},
    {name:'padded-four',model:makeIndependentMachine(0x1f3a995b,4),states:4}
  ];
  /** @type {Array<{name:string,states:number,queries:number,remaining:number,
   *  scanWork:number,equivalenceChecks:number,productPairs:number,elapsedMs:number,
   *  workspaceInitializationMs:number,candidateBytes:number}>} */
  const records=[];
  for(let index=0;index<fixtures.length;index++){
    const fixture=fixtures[index];
    assert.equal(reachableCount(fixture.model),fixture.states,fixture.name+' reachability');
    assert.equal(new Set(observableStateClasses(fixture.model)).size,fixture.states,
      fixture.name+' minimality');
    let privateState=0,received=0;
    const api={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        received++;
        const previous=privateState;
        privateState=fixture.model.next[previous][symbol];
        return fixture.model.output[previous][symbol];
      }
    };
    const result=await learnBoundedStepOnly(api,5,128,workspace);
    assert.equal(result.certified,true,fixture.name);
    assert.equal(result.queries,received,fixture.name+' query count');
    assert.ok(result.queries<=128,fixture.name+' query budget');
    assert.equal(result.modelBound,5);
    assert.equal(result.modelCount,FIVE_STATE_MODEL_COUNT);
    assert.equal(result.candidateBytes,663554832);
    assert.ok(typeof result.workspaceInitializationMs==='number'&&result.workspaceInitializationMs>0);
    assert.ok(typeof result.elapsedMs==='number'&&result.elapsedMs>0&&result.elapsedMs<15000,
      fixture.name+' fifteen-second offline attacker budget');
    assert.ok(typeof result.scanWork==='number'&&result.scanWork>0);
    assert.ok(typeof result.equivalenceChecks==='number'&&result.equivalenceChecks>=0);
    assert.ok(typeof result.productPairs==='number'&&result.productPairs>=0);
    assert.ok(result.clone);
    assert.equal(workspace.ids,backing,'workspace must be reused rather than allocating another 664 MiB');
    const hidden={...fixture.model,state:privateState};
    assert.equal(equivalentFromStates(result.clone,hidden),true,
      fixture.name+' independent partition-refinement certificate');
    for(const word of heldoutWords((0x7123abc1+Math.imul(index,10309))>>>0,128)){
      assert.deepEqual(traceFrom(result.clone,word),traceFrom(hidden,word),
        fixture.name+':'+word.join(''));
    }
    records.push({
      name:fixture.name,states:fixture.states,queries:result.queries,
      remaining:result.remaining,scanWork:result.scanWork||0,
      equivalenceChecks:result.equivalenceChecks||0,productPairs:result.productPairs||0,
      elapsedMs:result.elapsedMs||0,workspaceInitializationMs:result.workspaceInitializationMs||0,
      candidateBytes:result.candidateBytes||0
    });
  }
  const queries=records.map(record=>record.queries);
  console.log('STEP_ONLY_FIVE_STATE '+JSON.stringify({
    modelCount:FIVE_STATE_MODEL_COUNT,models:records.length,
    heldoutSequences:records.length*128,
    minQueries:Math.min(...queries),maxQueries:Math.max(...queries),
    meanQueries:queries.reduce((sum,value)=>sum+value,0)/queries.length,
    workspaceInitializationMs:workspace.initializationMs,
    candidateBytes:workspace.ids.byteLength,
    records
  }));
});
