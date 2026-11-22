'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'timeout-selective.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{
    seed:'sco-timeout-stack-source-provenance-20261122',
    privateNames:['protectedOp']
  });
}

test('native AbortSignal.timeout creates a host-owned DOMException stack',async()=>{
  const signal=AbortSignal.timeout(1);
  // Keep the Node event loop active: AbortSignal.timeout uses an unref timer.
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(signal.aborted,true);
  assert.equal(signal.reason.name,'TimeoutError');
  assert.match(String(signal.reason.stack),/TimeoutError/u);
});

test('SCO refuses a private AbortSignal.timeout stack read',()=>{
  const body='const signal=AbortSignal.timeout(1);'+
    "await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));"+
    'return signal.reason.stack;';
  assert.throws(()=>compile(body),TypeError);
});

test('SCO continues to permit direct explicit primitive AbortSignal.abort reason',()=>{
  const result=compile("return AbortSignal.abort('explicit').reason;");
  assert.deepEqual(result.privateNames,['protectedOp']);
});
