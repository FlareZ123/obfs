'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {binaryWords}=require('../sims/sco-sync-search');
const {makeIndependentMachine}=require('../sims/sco-sync-independent-distribution');
const {enumerateMachines,distinguish,learnBoundedStepOnly,predictContinuation}=
  require('../sims/sco-step-only-version-space');

/**
 * The evaluator knows the true machine; the public attacker only receives
 * its asynchronous step callback. No reset method is provided.
 * @param {{next:number[][],output:number[][]}} model
 * @param {number} maxStates
 * @param {number} maxQueries
 */
async function evaluate(model,maxStates,maxQueries){
  let state=0,received=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      received++;
      const previous=state;
      state=model.next[previous][symbol];
      return model.output[previous][symbol];
    }
  };
  const found=await learnBoundedStepOnly(api,maxStates,maxQueries);
  assert.equal(found.queries,received);
  assert.equal(found.inputs.length,received);
  assert.equal(found.outputs.length,received);
  if(found.certified){
    assert.ok(found.clone);
    // Independently verify the certificate against the private fixture for
    // every held-out binary word of length at most eight.
    for(const word of binaryWords(8)){
      /** @type {number[]} */
      const expected=[];
      let privateState=state;
      for(const symbol of word){
        expected.push(model.output[privateState][symbol]);
        privateState=model.next[privateState][symbol];
      }
      assert.deepEqual(predictContinuation(found.clone,word),expected);
    }
  }
  return found;
}

test('version space enumerates every labeled binary machine through three states',()=>{
  assert.equal(enumerateMachines(1).length,4);
  assert.equal(enumerateMachines(2).length,260);
  assert.equal(enumerateMachines(3).length,46916);
  assert.throws(()=>enumerateMachines(4),RangeError);
});

test('product search distinguishes different states and recognizes equivalent traces',()=>{
  const first={next:[[0,1],[1,1]],output:[[0,0],[1,1]],state:0};
  const second={next:[[0,1],[1,1]],output:[[0,0],[1,1]],state:1};
  assert.deepEqual(distinguish(first,second),[0]);
  assert.equal(distinguish(first,{...first}),null);
  const alwaysZero={next:[[1,1],[0,0]],output:[[0,0],[0,0]],state:0};
  assert.equal(distinguish(first,alwaysZero) instanceof Array,true);
});

test('every one- and two-state binary machine has certified continuation without reset',async()=>{
  let certified=0;
  let maxQueries=0;
  for(const model of enumerateMachines(2)){
    const result=await evaluate(model,2,64);
    assert.equal(result.certified,true);
    certified++;
    maxQueries=Math.max(maxQueries,result.queries);
  }
  assert.equal(certified,260);
  assert.equal(maxQueries,9);
});

test('independent three-state private machines admit certified held-out continuation',async()=>{
  for(let index=0;index<24;index++){
    const seed=(0xa82b11f5+Math.imul(index,4973))>>>0;
    const result=await evaluate(makeIndependentMachine(seed,3),3,64);
    assert.equal(result.certified,true,String(seed));
    assert.ok(result.queries<=27);
  }
});

test('query limits retain uncertainty and invalid output contracts fail explicitly',async()=>{
  const machine=makeIndependentMachine(0xdeadbeef,3);
  const short=await evaluate(machine,3,1);
  assert.equal(short.certified,false);
  assert.equal(short.clone,null);
  await assert.rejects(()=>learnBoundedStepOnly({async step(){return 2;}},2,3),/binary output/);
  await assert.rejects(()=>learnBoundedStepOnly({async step(){return 0;}},4,3),/maxStates/);
});

test('an understated state bound can certify a false clone and must not be trusted',async()=>{
  const privateModel=makeIndependentMachine(1,3);
  let privateState=0;
  const publicApi={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      const old=privateState;
      privateState=privateModel.next[old][symbol];
      return privateModel.output[old][symbol];
    }
  };
  const result=await learnBoundedStepOnly(publicApi,2,64);
  assert.equal(result.certified,true);
  assert.equal(result.queries,8);
  assert.ok(result.clone);
  assert.deepEqual(distinguish(result.clone,{...privateModel,state:privateState}),[0]);
});
