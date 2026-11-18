'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {testWMethod,characterizationSet,shortestSeparator}=require('../sims/sco-w-method');
const {learnAdaptiveMealy}=require('../sims/sco-adaptive-mealy');

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @param {Machine} model @param {number[]} word */
function trace(model,word){
  let state=0;
  /** @type {number[]} */
  const outputs=[];
  for(const symbol of word){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}
/** @param {Machine} model */
function oracle(model){
  let current=0;
  return {
    async reset(){current=0;return true;},
    /** @param {number} symbol */
    async step(symbol){
      const observed=model.output[current][symbol];
      current=model.next[current][symbol];
      return observed;
    }
  };
}
/** @returns {Machine[]} */
function allTwoStateModels(){
  /** @type {Machine[]} */
  const models=[];
  for(let mask=0;mask<256;mask++){
    /** @type {number[][]} */
    const next=[[],[]];
    /** @type {number[][]} */
    const output=[[],[]];
    let bits=mask;
    for(let state=0;state<2;state++)for(let symbol=0;symbol<2;symbol++){
      next[state][symbol]=bits&1;bits>>=1;
    }
    for(let state=0;state<2;state++)for(let symbol=0;symbol<2;symbol++){
      output[state][symbol]=bits&1;bits>>=1;
    }
    models.push({next,output});
  }
  return models;
}
/** @param {Machine} model */
function accessCover(model){
  /** @type {Map<number,number[]>} */
  const found=new Map([[0,[]]]);
  const queue=[0];
  for(const state of queue)for(let symbol=0;symbol<2;symbol++){
    const successor=model.next[state][symbol];
    if(!found.has(successor)){
      found.set(successor,[...(/** @type {number[]} */(found.get(state))),symbol]);
      queue.push(successor);
    }
  }
  return [...found.values()];
}
/** @param {Machine} left @param {Machine} right */
function equivalentTwoState(left,right){
  // The product automaton has at most four reachable state pairs.
  /** @type {Array<[number,number]>} */
  const queue=[[0,0]];
  const seen=new Set(['0,0']);
  for(const [a,b] of queue){
    for(let symbol=0;symbol<2;symbol++){
      if(left.output[a][symbol]!==right.output[b][symbol])return false;
      const nextA=left.next[a][symbol],nextB=right.next[b][symbol];
      const pair=nextA+','+nextB;
      if(!seen.has(pair)){
        seen.add(pair);queue.push([nextA,nextB]);
      }
    }
  }
  return true;
}

test('complete W-method agrees with independent product-equivalence over 5376 two-state pairs',async()=>{
  const models=allTwoStateModels();
  let pairs=0,equivalent=0;
  for(let i=0;i<models.length;i+=7){
    const model=models[i],access=accessCover(model);
    if(access.length!==2)continue;
    const hypothesis={...model,access};
    try{characterizationSet(hypothesis);}catch{continue;}
    for(const target of models){
      const tested=await testWMethod(hypothesis,2,async word=>trace(target,word));
      const same=equivalentTwoState(hypothesis,target);
      assert.equal(tested.passed,same,'hypothesis='+i+',target='+JSON.stringify(target));
      assert.equal(tested.exhaustive,same);
      pairs++;
      if(same)equivalent++;
    }
  }
  assert.equal(pairs,5376);
  assert.equal(equivalent,21);
  console.log('W_METHOD_EXHAUSTIVE '+JSON.stringify({pairs,equivalent}));
});

test('one-state hypotheses are complete against all 256 possible two-state targets',async()=>{
  const targets=allTwoStateModels();
  let checked=0;
  for(const first of [0,1])for(const second of [0,1]){
    const hypothesis={next:[[0,0]],output:[[first,second]],access:[[]]};
    for(const target of targets){
      const conformance=await testWMethod(hypothesis,2,async word=>trace(target,word));
      const equal=equivalentTwoState(hypothesis,target);
      assert.equal(conformance.exhaustive,equal);
      checked++;
    }
  }
  assert.equal(checked,1024);
});

test('W-method preserves signed zero and NaN output distinctions',async()=>{
  const hypothesis={next:[[0,0]],output:[[0,NaN]],access:[[]]};
  const equivalent=await testWMethod(hypothesis,1,async word=>trace(hypothesis,word));
  assert.equal(equivalent.exhaustive,true);
  const changed={next:[[0,0]],output:[[-0,NaN]],access:[[]]};
  const unequal=await testWMethod(hypothesis,1,async word=>trace(changed,word));
  assert.equal(unequal.exhaustive,false);
  assert.equal(unequal.passed,false);
  assert.deepEqual(unequal.counterexample,[0]);
  const invalidLength=await testWMethod(hypothesis,1,async()=>[]);
  assert.equal(invalidLength.passed,false);
});

test('W-method rejects false confidence from delayed output and refuses certification at a strict cap',async()=>{
  const size=16;
  /** @type {Machine} */
  const hidden={
    next:Array.from({length:size},(_,state)=>[Math.min(state+1,size-1),0]),
    output:Array.from({length:size},(_,state)=>[state===size-2?1:0,0])
  };
  const sampled=await learnAdaptiveMealy(oracle(hidden),
    {maxStates:size,conformanceDepth:6,randomProbes:256});
  assert.equal(sampled.conformancePassed,true);
  assert.equal(sampled.machine.next.length,1);
  const withheld=Array(size-1).fill(0);
  assert.notDeepEqual(trace(sampled.machine,withheld),trace(hidden,withheld));
  const capped=await testWMethod(sampled.machine,size,async word=>trace(hidden,word),1000);
  assert.equal(capped.passed,true);
  assert.equal(capped.exhaustive,false);
  assert.equal(capped.tests,1000);
  const full=await testWMethod(sampled.machine,size,async word=>trace(hidden,word),150000);
  assert.equal(full.passed,false);
  assert.equal(full.exhaustive,false);
  assert.ok(full.tests>1000);
  assert.deepEqual(full.counterexample,withheld);
  console.log('W_METHOD_DELAYED '+JSON.stringify({candidateStates:sampled.machine.next.length,cap:1000,witnessTests:full.tests}));
});

test('opt-in full W-method certification recovers long-delay sixteen-state model',async()=>{
  const size=16;
  /** @type {Machine} */
  const hidden={
    next:Array.from({length:size},(_,state)=>[Math.min(state+1,size-1),0]),
    output:Array.from({length:size},(_,state)=>[state===size-2?1:0,0])
  };
  const found=await learnAdaptiveMealy(oracle(hidden),
    {maxStates:size,conformanceDepth:4,randomProbes:32,
      certifyWithinBound:true,maxCertificateWords:150000});
  assert.equal(found.certifiedWithinBound,true);
  assert.equal(found.conformancePassed,true);
  assert.ok(found.counterexamples>=1);
  assert.equal(found.machine.next.length,16);
  assert.deepEqual(trace(found.machine,Array(size+2).fill(0)),trace(hidden,Array(size+2).fill(0)));
  console.log('W_METHOD_CHAIN_CERTIFIED '+JSON.stringify({states:found.machine.next.length,calls:found.requests+found.steps,wMethodTests:found.wMethodTests}));
});

test('strict W-method cap never returns certified true for incomplete conformance',async()=>{
  const hidden=allTwoStateModels()[173];
  const found=await learnAdaptiveMealy(oracle(hidden),
    {maxStates:8,conformanceDepth:2,randomProbes:0,
      certifyWithinBound:true,maxCertificateWords:1});
  assert.equal(found.certifiedWithinBound,false);
  assert.equal(found.conformancePassed,true);
  assert.equal(found.wMethodTests,1);
});

test('shortest separator is computed only from public hypothesis transitions',()=>{
  const machine={next:[[0,1],[1,1]],output:[[0,0],[1,0]],access:[[],[1]]};
  assert.deepEqual(shortestSeparator(machine,0,1),[0]);
  assert.ok(characterizationSet(machine).some(word=>word.length===1 && word[0]===0));
});
