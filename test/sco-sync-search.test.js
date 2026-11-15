'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {binaryWords,searchSynchronizingWord}=require('../sims/sco-sync-search');
const {makeSynchronizingMachine}=require('../sims/sco-synchronizing-oracle');

test('binary candidate enumeration is breadth-first and deterministic',()=>{
  assert.deepEqual(binaryWords(2),[[0],[1],[0,0],[0,1],[1,0],[1,1]]);
  assert.equal(binaryWords(3).length,14);
});

test('observational search recovers 000 from step-only oracle across independent seeds',async()=>{
  for(let seed=0;seed<64;seed++){
    const model=makeSynchronizingMachine((seed*3317+0x1237ab42)>>>0);
    let state=0,operations=0;
    const api={
      async step(symbol){
        operations++;
        const previous=state;
        state=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const found=await searchSynchronizingWord(api,3,6);
    assert.deepEqual(found.word,[0,0,0],String(seed));
    assert.equal(found.steps,operations);
    assert.equal(found.inputTape.length,operations);
  }
});

test('non-synchronizable four-state permutation machine is rejected on this observable fixture',async()=>{
  let state=0;
  const next=Array.from({length:4},(_,index)=>[(index+1)%4,(index+3)%4]);
  const output=Array.from({length:4},(_,index)=>[[0,0,1,1][index],[1,0,1,0][index]]);
  const api={
    async step(symbol){
      const previous=state;
      state=next[previous][symbol];
      return output[previous][symbol];
    }
  };
  const found=await searchSynchronizingWord(api,3,6);
  assert.equal(found.word,null);
  assert.ok(found.steps>0);
});
