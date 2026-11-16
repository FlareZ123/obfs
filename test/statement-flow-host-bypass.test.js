'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {stripPublicHostGuard}=require('../sims/branch-block-host-bypass');

/**
 * An owned Node global reproduces the relevant documented host check.
 * The test does not claim to spoof a browser's actual origin: tampering with
 * available client code is independently sufficient for this adversary.
 * @param {string} source
 * @returns {Promise<{f:(value:number)=>number}>}
 */
async function importPayload(source){
  return /** @type {Promise<{f:(value:number)=>number}>} */ (
    import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  );
}

test('full-layered COO statement CFG host guard can be removed by source owner',{
  timeout:30000
},async()=>{
  const original='export function f(x){var a=(x|0)*3;if(a>50){a-=9;}else if(a>10){a+=7;}else{a^=12;}return a;}';
  const output=obfuscateFiles([{
    path:'f.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',seed:'statement-host-bypass-20261116',
    identifiers:true,strings:true,properties:true,
    experimentalStatementFlow:{'f.mjs':['f']},
    allowedHosts:['allowed.example']
  });
  assert.equal(output.files[0].metrics.statementFlowFunctions,1);
  const emitted=String(output.files[0].code);
  const attacked=stripPublicHostGuard(emitted);
  assert.ok(attacked.length<emitted.length);
  const baseline=await importPayload(original);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{
    value:{hostname:'untrusted.example'},configurable:true
  });
  try{
    await assert.rejects(importPayload(emitted),/Unauthorized execution host/u);
    const cloned=await importPayload(attacked);
    for(let x=-256;x<=256;x++){
      assert.equal(cloned.f(x),baseline.f(x),'Host bypass functional mismatch '+x);
    }
  }finally{
    if(!descriptor)Reflect.deleteProperty(globalThis,'location');
    else Object.defineProperty(globalThis,'location',descriptor);
  }
});
