'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {enumerateMachines,distinguish}=require('../sims/sco-step-only-version-space');
const {createTwoStateWeightedWorkspace,learnTwoStateWeightedStepOnly}=
  require('../sims/sco-step-only-two-state-expected');

/** @param {'boundedNine'|'expected'} policy @returns {Promise<{calls:number,max:number,histogram:number[]}>} */
async function census(policy){
  const models=enumerateMachines(2);
  const workspace=createTwoStateWeightedWorkspace();
  /** @type {number[]} */
  const histogram=[];
  let calls=0,max=0;
  for(const model of models){
    let state=0,received=0;
    const api={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        assert.ok(symbol===0||symbol===1);
        received++;
        const previous=state;
        state=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const found=await learnTwoStateWeightedStepOnly(api,policy,workspace);
    assert.equal(found.certified,true);
    assert.equal(found.queries,received);
    assert.equal(found.inputs.length,received);
    assert.equal(found.outputs.length,received);
    assert.equal(found.modelCount,260);
    assert.equal(found.posteriorStates,2365);
    assert.equal(found.policy,policy);
    assert.equal(distinguish(found.clone,{...model,state}),null,
      'certified clone must match every possible future sequence');
    histogram[received]=(histogram[received]||0)+1;
    calls+=received;
    max=Math.max(max,received);
  }
  return {calls,max,histogram:Array.from({length:histogram.length},(_,index)=>histogram[index]||0)};
}

test('authorized no-reset weighted learner certifies all 260 two-state models with nine-query cap',async()=>{
  assert.deepEqual(await census('boundedNine'),{
    calls:1884,max:9,histogram:[0,0,0,0,0,0,40,156,24,40]
  });
});

test('expected-cost policy certifies all 260 models with ten-query cap',async()=>{
  assert.deepEqual(await census('expected'),{
    calls:1776,max:10,histogram:[0,0,0,0,0,16,132,48,32,8,24]
  });
});

test('weighted learner enforces output and policy contracts before false certification',async()=>{
  await assert.rejects(()=>learnTwoStateWeightedStepOnly({async step(){return 0;}},
    // @ts-expect-error Deliberate invalid runtime policy.
    'invalid'),RangeError);
  await assert.rejects(()=>learnTwoStateWeightedStepOnly({async step(){return 2;}}),
    /binary output/);
});


test('understated two-state bound can certify a false clone of a three-state oracle',async()=>{
  const hidden={
    next:[[1,0],[2,0],[2,0]],
    output:[[0,0],[0,0],[1,0]]
  };
  const workspace=createTwoStateWeightedWorkspace();
  /** @type {Array<'boundedNine'|'expected'>} */
  const policies=['boundedNine','expected'];
  for(const policy of policies){
    let privateState=0;
    const publicApi={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        const previous=privateState;
        privateState=hidden.next[previous][symbol];
        return hidden.output[previous][symbol];
      }
    };
    const found=await learnTwoStateWeightedStepOnly(publicApi,policy,workspace);
    assert.equal(found.certified,true);
    assert.equal(found.queries,policy==='boundedNine'?7:6);
    assert.ok(distinguish(found.clone,{...hidden,state:privateState}),
      'false state bound must not be promoted to a truthful continuation certificate');
  }
});


test('a continuation clone need not reproduce a newly restarted source session',async()=>{
  const original={
    next:[[1,1],[1,1]],
    output:[[0,0],[1,0]]
  };
  let privateState=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      const previous=privateState;
      privateState=original.next[previous][symbol];
      return original.output[previous][symbol];
    }
  };
  const result=await learnTwoStateWeightedStepOnly(api,'boundedNine');
  assert.equal(result.certified,true);
  assert.equal(result.queries,6);
  assert.equal(privateState,1);
  assert.equal(distinguish(result.clone,{...original,state:privateState}),null);
  assert.deepEqual(distinguish(result.clone,{...original,state:0}),[0],
    'current-state certification makes no new-session reset guarantee');
});

test('nonstationary server mutation breaks a certificate even with two instantaneous states',async()=>{
  let calls=0;
  const api={
    /** @param {number} _symbol @returns {Promise<number>} */
    async step(_symbol){calls++;return calls<=20?0:1;}
  };
  const result=await learnTwoStateWeightedStepOnly(api,'boundedNine');
  assert.equal(result.certified,true);
  assert.equal(result.queries,7);
  while(calls<20)await api.step(0);
  const future=await api.step(0);
  const clonePrediction=result.clone.output[result.clone.state][0];
  assert.equal(future,1);
  assert.equal(clonePrediction,0,
    'finite stationary-model certificates cannot prove a time-varying service');
});
