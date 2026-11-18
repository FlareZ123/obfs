'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createScoBatchMethod,getScoBatchCalls}=require('../src/rpc-batch');

test('opt-in cooperative batch yields server turn and retains ordered values',async()=>{
  /** @type {Array<number|string>} */
  const events=[];
  const tasks={
    /** @param {number} value @returns {Promise<number>} */
    async value(value){
      events.push(value);
      return value*3;
    }
  };
  const execute=createScoBatchMethod(tasks,{maxCalls:8,yieldEvery:2});
  const calls=Array.from({length:6},(_,n)=>({method:'value',args:[n]}));
  assert.deepEqual(getScoBatchCalls(execute,[calls]),calls);
  /** @type {Promise<void>} */
  const outer=new Promise(resolve=>setImmediate(()=>{
    events.push('outer');resolve();
  }));
  const output=await execute(calls);
  await outer;
  assert.deepEqual(output,[
    {ok:true,value:0},{ok:true,value:3},{ok:true,value:6},
    {ok:true,value:9},{ok:true,value:12},{ok:true,value:15}
  ]);
  assert.deepEqual(events,[0,1,'outer',2,3,4,5]);
});

test('default batch has no scheduling yield and preserves same returned values',async()=>{
  /** @type {Array<number|string>} */
  const events=[];
  const execute=createScoBatchMethod({
    /** @param {number} value @returns {Promise<number>} */
    async value(value){events.push(value);return value*3;}
  },{maxCalls:8});
  const calls=Array.from({length:6},(_,n)=>({method:'value',args:[n]}));
  /** @type {Promise<void>} */
  const outer=new Promise(resolve=>setImmediate(()=>{
    events.push('outer');resolve();
  }));
  const output=await execute(calls);
  await outer;
  assert.deepEqual(output.map(x=>x.ok?x.value:null),[0,3,6,9,12,15]);
  assert.deepEqual(events,[0,1,2,3,4,5,'outer']);
});

test('cooperative batch rejects invalid yield policy, preserves item error handling',async()=>{
  for(const yieldEvery of [-1,1.1,1025,NaN,Infinity]){
    assert.throws(()=>createScoBatchMethod({value:()=>3},{yieldEvery}),
      /yieldEvery/u);
  }
  const run=createScoBatchMethod({
    /** @param {number} value @returns {number} */
    value(value){
      if(value===2)throw Error('PRIVATE_ERROR_CANARY');
      return value*5;
    }
  },{yieldEvery:1,maxCalls:4});
  const items=[1,2,3].map(n=>({method:'value',args:[n]}));
  assert.deepEqual(await run(items),[
    {ok:true,value:5},
    {ok:false,error:'Operation failed'},
    {ok:true,value:15}
  ]);
  assert.deepEqual(getScoBatchCalls(run,[items]),items);
  assert.deepEqual(getScoBatchCalls(run,[[{method:'missing',args:[]}]]),[]);
  await assert.rejects(run([{method:'missing',args:[]}]),/Invalid or oversized RPC batch/u);
});
