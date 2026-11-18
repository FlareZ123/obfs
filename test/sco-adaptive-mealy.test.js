'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {learnAdaptiveMealy}=require('../sims/sco-adaptive-mealy');
const {makeVariableMachine}=require('../sims/sco-sync-state-size');
const {learnMachine,privateTrace,scenario}=require('../sims/sco-stateful-oracle');

/** @typedef {{next:number[][],output:number[][]}} Machine */

/**
 * Create the public RPC interface. This helper is the *only* component
 * holding the private transition table during attack execution.
 * @param {Machine} hidden
 * @returns {{api:{reset:()=>Promise<boolean>,step:(symbol:number)=>Promise<number>},counts:{resets:number,steps:number}}}
 */
function oracle(hidden){
  let current=0;
  const counts={resets:0,steps:0};
  return {counts,api:{
    async reset(){counts.resets++;current=0;return true;},
    /** @param {number} symbol */
    async step(symbol){
      counts.steps++;
      const observed=hidden.output[current][symbol];
      current=hidden.next[current][symbol];
      return observed;
    }
  }};
}

/** @param {number} initial @param {number} count @returns {number[][]} */
function independentHeldout(initial,count){
  let random=initial>>>0;
  /** @type {number[][]} */
  const words=[];
  for(let i=0;i<count;i++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%60);
    /** @type {number[]} */
    const word=[];
    for(let k=0;k<length;k++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)&1);
    }
    words.push(word);
  }
  return words;
}

test('active public-query learner reproduces held-out stateful behavior for 4, 6, 8 and 12 hidden states',async()=>{
  let models=0,unseen=0,total=0;
  for(const states of [4,6,8,12]){
    let stateCalls=0;
    for(let index=0;index<64;index++){
    const hidden=makeVariableMachine((0x13579bdf+Math.imul(index,4567))>>>0,states);
    const {api,counts}=oracle(hidden);
    const found=await learnAdaptiveMealy(api,{maxStates:states,conformanceDepth:6,randomProbes:256});
    assert.equal(found.conformancePassed,true,'states='+states+',index='+index);
    assert.equal(found.requests,counts.resets);
    assert.equal(found.steps,counts.steps);
    assert.ok(found.machine.next.length<=states);
    const training=new Set(found.trainingWords);
    for(const word of independentHeldout((0x87bd1a12+Math.imul(index,10309))>>>0,128)){
      assert.deepEqual(privateTrace(found.machine,word),privateTrace(hidden,word),
        'states='+states+',index='+index+',word='+word.join(''));
      total++;
      if(!training.has(JSON.stringify(word)))unseen++;
    }
    models++;
    stateCalls+=found.requests+found.steps;
    }
    console.log('ADAPTIVE_STATE_SWEEP '+JSON.stringify({states,models:64,totalCalls:stateCalls}));
  }
  console.log('ADAPTIVE_HELDOUT '+JSON.stringify({models,heldout:total,strictlyUnseen:unseen}));
  assert.equal(models,256);
  assert.ok(unseen>total/2,'Independent held-out words must not be mostly training repeats');
});

test('matched exhaustive learner has higher public-call cost on sample six-state machines',async()=>{
  let oldCalls=0,newCalls=0;
  for(let index=0;index<12;index++){
    const hidden=makeVariableMachine((0x9ab337e1+Math.imul(index,7919))>>>0,6);
    const older=oracle(hidden),newer=oracle(hidden);
    const old=await learnMachine(older.api,6,2);
    const adaptive=await learnAdaptiveMealy(newer.api,
      {maxStates:6,conformanceDepth:6,randomProbes:256});
    assert.equal(adaptive.conformancePassed,true);
    assert.equal(old.requests,older.counts.resets+older.counts.steps);
    assert.equal(adaptive.requests+adaptive.steps,newer.counts.resets+newer.counts.steps);
    for(const word of independentHeldout((0x2468ace1+Math.imul(index,3917))>>>0,128)){
      assert.deepEqual(privateTrace(old.machine,word),privateTrace(hidden,word));
      assert.deepEqual(privateTrace(adaptive.machine,word),privateTrace(hidden,word));
    }
    oldCalls+=old.requests;
    newCalls+=adaptive.requests+adaptive.steps;
  }
  console.log('ADAPTIVE_MATCHED '+JSON.stringify({models:12,oldCalls,newCalls,ratio:newCalls/oldCalls}));
  assert.ok(newCalls<oldCalls,'adaptive='+newCalls+',exhaustive='+oldCalls);
});

test('finite conformance probes remain explicitly unverified against a long-delay witness',async()=>{
  const size=16;
  /** @type {Machine} */
  const delayed={
    next:Array.from({length:size},(_,state)=>[Math.min(state+1,size-1),0]),
    output:Array.from({length:size},(_,state)=>[state===size-2?1:0,0])
  };
  const found=await learnAdaptiveMealy(oracle(delayed).api,
    {maxStates:size,conformanceDepth:6,randomProbes:256});
  const withheld=Array.from({length:size-1},()=>0);
  const matches=JSON.stringify(privateTrace(found.machine,withheld))===
    JSON.stringify(privateTrace(delayed,withheld));
  console.log('ADAPTIVE_DELAYED_WITNESS '+JSON.stringify({maxStates:size,learnedStates:found.machine.next.length,conformancePassed:found.conformancePassed,heldoutExact:matches}));
  assert.equal(typeof matches,'boolean');
  assert.equal(Object.hasOwn(found,'verifiedExact'),false);
  assert.equal(typeof found.conformancePassed,'boolean');
});

test('adaptive learner works through a compiler-generated authorized SCO HTTP facade',async()=>{
  const result=await scenario(9,true);
  assert.equal(result.learnedStates,4);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.heldout,2046);
  assert.ok(result.strictlyUnseen>0);
});
