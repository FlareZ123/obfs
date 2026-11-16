'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../../src/wasm-i32');

/** @param {string} source @returns {(a:number,b:number,c:number)=>number} */
function load(source){
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {(a:number,b:number,c:number)=>number} */ (
    /** @type {unknown} */ (module.exports));
}

/** @param {number[]} values @returns {number} */
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}

/**
 * Verify an actual checked-in output and independently clone its public Wasm.
 * The typed-input contract is primitive signed Int32 Numbers for all arguments.
 * @returns {void}
 */
function main(){
  const before=fs.readFileSync(path.join(__dirname,'before.cjs'),'utf8').replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(__dirname,'after.cjs'),'utf8').replace(/\r\n/g,'\n');
  const result=lowerWasmI32Functions(before,'commonjs',{
    seed:'agent38-wasm-multi-sample-v1',names:['fuse']
  });
  assert.equal(result.code,after,'Pinned output must match the compiler-generated source');
  assert.equal(result.functions,1);
  const match=after.match(/Uint8Array\.from\((\[[0-9,]+\])\)/u);
  assert.ok(match);
  const binary=Uint8Array.from(JSON.parse(match[1]));
  assert.ok(WebAssembly.validate(binary));
  const cloned=/** @type {(a:number,b:number,c:number)=>number} */ (
    new WebAssembly.Instance(new WebAssembly.Module(binary)).exports.f);
  assert.equal(cloned.length,3);
  const native=load(before),protectedFn=load(after);
  for(let i=0;i<12000;i++){
    const a=(i*1664525)|0,b=(i*1013904223)|0,c=(i*69069)|0;
    const expected=native(a,b,c);
    assert.equal(protectedFn(a,b,c),expected);
    assert.equal(cloned(a,b,c),expected);
  }
  /** @param {(a:number,b:number,c:number)=>number} fn @returns {number} */
  function work(fn){
    let sum=0;
    for(let i=0;i<200000;i++)sum^=fn(i|0,(i*1664525)|0,(i*1013904223)|0);
    return sum|0;
  }
  for(let i=0;i<5;i++)assert.equal(work(native),work(protectedFn));
  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const loweredTimes=[];
  for(let i=0;i<13;i++){
    const pair=i%2?[[protectedFn,loweredTimes],[native,nativeTimes]]:
      [[native,nativeTimes],[protectedFn,loweredTimes]];
    for(const [fn,times] of /** @type {Array<[(a:number,b:number,c:number)=>number,number[]]>} */ (pair)){
      const start=performance.now();
      work(fn);
      times.push(performance.now()-start);
    }
  }
  console.log(JSON.stringify({
    sourceSHA256:createHash('sha256').update(before).digest('hex'),
    outputSHA256:createHash('sha256').update(after).digest('hex'),
    generatedBytes:Buffer.byteLength(after),wasmBytes:result.wasmBytes,
    typedInputComparisons:12000,publicBinaryClone:true,
    nativeMedianMs:median(nativeTimes),protectedMedianMs:median(loweredTimes),
    warmRatio:median(loweredTimes)/median(nativeTimes)
  }));
}

if(require.main===module)main();
module.exports={main};
