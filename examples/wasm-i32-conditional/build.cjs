'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
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

/** @param {number[]} values @returns {number} */
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}

/**
 * Verify exact compiler-generated JS, typed semantics and independent static
 * extraction, with a measured warm 2.5x gate diagnostic.
 */
function main(){
  const before=fs.readFileSync(path.join(__dirname,'before.cjs'),'utf8').replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(__dirname,'after.cjs'),'utf8').replace(/\r\n/g,'\n');
  const built=lowerWasmI32Functions(before,'commonjs',{
    seed:'agent38-wasm-select-sample-v1',names:['mux']
  });
  assert.equal(built.functions,1);
  assert.equal(built.code,after,'Committed output must match the actual compiler');
  const binary=extractPublicWasm(after);
  assert.equal(binary.length,70);
  const recovered=recoverPublicWasmExpression(after,['a','b','c','d']);
  assert.equal(recovered.expression,'(a?((b^c)&255):((~b)|d))');
  const native=load(before),compiled=load(after);
  const cloned=load('function mux(a,b,c,d){return '+recovered.expression+';}module.exports=mux;');
  let comparisons=0,checksum=0;
  for(let i=0;i<20000;i++){
    const args=/** @type {[number,number,number,number]} */ ([
      (i-10000)|0,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
    ]);
    const expected=native(...args);
    assert.equal(compiled(...args),expected);
    assert.equal(cloned(...args),expected);
    comparisons++;
    checksum^=expected;
  }
  /** @param {typeof native} fn @returns {number} */
  function work(fn){
    let accumulator=0;
    for(let i=0;i<200000;i++)accumulator^=fn(i|0,(i*1664525)|0,
      (i*1013904223)|0,(i*69069)|0);
    return accumulator|0;
  }
  for(let trial=0;trial<5;trial++)assert.equal(work(native),work(compiled));
  /** @type {number[]} */
  const timesNative=[];
  /** @type {number[]} */
  const timesCompiled=[];
  for(let trial=0;trial<13;trial++){
    const pair=trial%2?[[compiled,timesCompiled],[native,timesNative]]:
      [[native,timesNative],[compiled,timesCompiled]];
    for(const [fn,times] of /** @type {Array<[typeof native,number[]]>} */ (pair)){
      const start=performance.now();
      work(fn);
      times.push(performance.now()-start);
    }
  }
  console.log(JSON.stringify({
    sample:'wasm-i32-conditional-select',typedComparisons:comparisons,checksum,
    sourceSHA256:createHash('sha256').update(before).digest('hex'),
    outputSHA256:createHash('sha256').update(after).digest('hex'),
    sourceBytes:Buffer.byteLength(before),outputBytes:Buffer.byteLength(after),
    wasmBytes:binary.length,exactStaticRecovery:true,
    nativeMedianMs:median(timesNative),compiledMedianMs:median(timesCompiled),
    warmRatio:median(timesCompiled)/median(timesNative)
  }));
}

if(require.main===module)main();
module.exports={main};
