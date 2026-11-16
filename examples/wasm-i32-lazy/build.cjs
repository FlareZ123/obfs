'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../../src/wasm-i32');
const {extractPublicWasm,recoverPublicWasmExpression}=
  require('../../sims/wasm-i32-static-recover');

/** @param {string} code @returns {(a:number,b:number,c:number,d:number)=>number} */
function load(code){
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {(a:number,b:number,c:number,d:number)=>number} */(
    /** @type {unknown} */ (module.exports));
}

/** @param {number[]} v @returns {number} */
function median(v){return [...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];}

/**
 * Reproduce pinned compiler output, native results, source-only static clone
 * and a head-to-head cost observation against the opt-in eager select policy.
 */
function main(){
  const before=fs.readFileSync(path.join(__dirname,'before.cjs'),'utf8').replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(__dirname,'after.cjs'),'utf8').replace(/\r\n/g,'\n');
  const auto=lowerWasmI32Functions(before,'commonjs',{
    seed:'agent38-wasm-lazy-sample-v1',names:['branch']
  });
  assert.equal(auto.functions,1);
  assert.equal(auto.code,after,'Committed lazy output must equal compiler-generated source');
  const binary=extractPublicWasm(after);
  assert.equal(binary.length,185);
  assert.ok(binary.some((value,i)=>value===0x04&&binary[i+1]===0x7f));
  const recovered=recoverPublicWasmExpression(after,['a','b','c','d']);
  const native=load(before),compiled=load(after);
  const cloned=load('function branch(a,b,c,d){return '+
    recovered.expression+';}module.exports=branch;');
  const eager=lowerWasmI32Functions(before,'commonjs',{
    seed:'agent38-wasm-lazy-sample-v1',names:['branch'],conditionalStrategy:'select'
  });
  assert.equal(eager.functions,1);
  const eagerFn=load(eager.code);
  let checksum=0;
  for(let i=0;i<20000;i++){
    const args=/** @type {[number,number,number,number]} */([
      i%32===0?i|0:0,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
    ]);
    const answer=native(...args);
    assert.equal(compiled(...args),answer);
    assert.equal(cloned(...args),answer);
    assert.equal(eagerFn(...args),answer);
    checksum^=answer;
  }
  /** @param {typeof native} fn @returns {number} */
  function work(fn){
    let sum=0;
    for(let i=0;i<200000;i++)sum^=fn(i%32===0?i|0:0,
      (i*1664525)|0,(i*1013904223)|0,(i*69069)|0);
    return sum|0;
  }
  for(let i=0;i<5;i++){
    assert.equal(work(native),work(compiled));
    assert.equal(work(native),work(eagerFn));
  }
  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const lazyTimes=[];
  /** @type {number[]} */
  const eagerTimes=[];
  for(let trial=0;trial<13;trial++){
    /** @type {[typeof native,number[]][]} */
    const order=trial%2?
      [[eagerFn,eagerTimes],[compiled,lazyTimes],[native,nativeTimes]]:
      [[native,nativeTimes],[compiled,lazyTimes],[eagerFn,eagerTimes]];
    for(const [fn,times] of order){
      const start=performance.now();
      work(fn);
      times.push(performance.now()-start);
    }
  }
  console.log(JSON.stringify({
    sample:'wasm-i32-asymmetric-lazy',typedComparisons:20000,checksum,
    sourceSHA256:createHash('sha256').update(before).digest('hex'),
    emittedSHA256:createHash('sha256').update(after).digest('hex'),
    jsBytes:Buffer.byteLength(after),wasmBytes:binary.length,
    publicSourceRecovery:recovered.expression,
    nativeMedianMs:median(nativeTimes),lazyMedianMs:median(lazyTimes),
    eagerMedianMs:median(eagerTimes),
    lazyHotRatio:median(lazyTimes)/median(nativeTimes),
    eagerHotRatio:median(eagerTimes)/median(nativeTimes)
  }));
}

if(require.main===module)main();
module.exports={main};
