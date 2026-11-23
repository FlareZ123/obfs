'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/**
 * Strictly typed signed i32 Number inputs: no dynamic coercion, getters,
 * externally patched operators or -0. Result expressions have an explicit
 * bitwise ToInt32 boundary before returning to the JavaScript caller.
 * @param {string} source
 * @returns {(...args:number[])=>number}
 */
function load(source){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */ (module.exports);
}

let state=0x61c88647;
/** @returns {number} */
function next(){
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return state|0;
}
const boundaries=[-2147483648,-2147483647,-65536,-1,0,1,2,65535,2147483646,2147483647];

/** @type {Array<{parameters:string[],expression:string}>} */
const positive=[
  {parameters:['a','b'],expression:'((a+b)|0)'},
  {parameters:['a','b'],expression:'((a+b)>>>0)'},
  {parameters:['a','b'],expression:'(~(a+b))'},
  {parameters:['a','b','c'],expression:'((((a+b)+(c>>>0))>>>0)^(a<<2))'},
  {parameters:['a','b'],expression:'(((a+b)|0)?((a+(b>>>0))|0):(a^b))'},
  {parameters:['a','b'],expression:'(((a+b)&1)^((~(a+b))|(a>>>3)))'},
  {parameters:['a','b'],expression:'((a+(b>>>0))<<((a+b)&31))'}
];

test('Wasm i32 admits bounded additive expressions only under explicit bitwise coercion',()=>{
  let comparisons=0;
  for(let expressionIndex=0;expressionIndex<positive.length;expressionIndex++){
    const fixture=positive[expressionIndex];
    const source='function f('+fixture.parameters.join(',')+'){return '+
      fixture.expression+';}module.exports=f;';
    const native=load(source);
    for(let seedIndex=0;seedIndex<3;seedIndex++){
      const compiled=lowerWasmI32Functions(source,'commonjs',{
        seed:'bounded-coerced-add-'+expressionIndex+'/'+seedIndex,names:['f']
      });
      assert.equal(compiled.functions,1,fixture.expression);
      assert.equal(compiled.declined,0);
      const emitted=load(compiled.code);
      // The embedded i32.add is public, not a secret or an anti-debugging key.
      const recovered=recoverPublicWasmExpression(compiled.code,fixture.parameters);
      const cloned=load('function f('+fixture.parameters.join(',')+
        '){return '+recovered.expression+';}module.exports=f;');
      for(let sample=0;sample<160;sample++){
        const values=fixture.parameters.map((_,index)=>sample<boundaries.length?
          boundaries[(sample+index)%boundaries.length]:next());
        const result=native(...values);
        assert.ok(Object.is(emitted(...values),result),
          'emitted/native disagreement at '+expressionIndex+'/'+seedIndex+'/'+sample);
        assert.ok(Object.is(cloned(...values),result),
          'bytecode-only clone disagreement at '+expressionIndex+'/'+seedIndex+'/'+sample);
        comparisons++;
      }
    }
  }
  assert.equal(comparisons,positive.length*3*160);
});

test('uncoerced sum and conditional test stay outside the additive grammar',()=>{
  for(const expr of [
    'a+b',
    '(a+b)?1:2',
    '((a+b)?1:2)|0',
    'a?((a+b)|0):(a+b)',
    'a+(b|0)',
    '((a+b)+0.5)|0',
    '(a+(b*3))|0',
    '((a+b)+Infinity)|0'
  ]){
    const source='function f(a,b){return '+expr+';}module.exports=f;';
    const compiled=lowerWasmI32Functions(source,'commonjs',{
      seed:'additive-rejection',names:['f']
    });
    assert.equal(compiled.functions,0,expr);
    assert.equal(compiled.declined,1,expr);
    assert.equal(compiled.code,source,expr);
  }
});

/** @param {number[]} samples @returns {number} */
function median(samples){return [...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)];}

/**
 * A warm same-source cross-realm pilot, *not* a universal 2.5x certificate.
 * The original and compiled functions share the same generated inputs and
 * work function, and invocation order is alternated.
 */
test('record bounded-addition native/Wasm hot ratio and cold initialization',()=>{
  const source='function f(a,b){return ((a+b)|0)^(a>>>5);}module.exports=f;';
  const generated=lowerWasmI32Functions(source,'commonjs',{
    seed:'additive-hot-profile',names:['f']
  });
  assert.equal(generated.functions,1);
  const n0=performance.now();
  const native=load(source);
  const nativeStartupMs=performance.now()-n0;
  const w0=performance.now();
  const compiled=load(generated.code);
  const wasmStartupMs=performance.now()-w0;
  const inputs=Array.from({length:1024},()=>[next(),next()]);
  /** @param {(...args:number[])=>number} fn @param {number} calls @returns {number} */
  function work(fn,calls){
    let digest=0;
    for(let i=0;i<calls;i++){
      const pair=inputs[i&1023];
      digest^=fn(pair[0],pair[1]);
    }
    return digest|0;
  }
  for(let i=0;i<3;i++)assert.equal(work(native,100000),work(compiled,100000));
  /** @type {number[]} */
  const nativeSamples=[];
  /** @type {number[]} */
  const compiledSamples=[];
  for(let repeat=0;repeat<13;repeat++){
    /** @type {[((...args:number[])=>number),number[]][]} */
    const pair=repeat%2===0?[[native,nativeSamples],[compiled,compiledSamples]]:
      [[compiled,compiledSamples],[native,nativeSamples]];
    for(const [fn,samples] of pair){
      const start=performance.now();
      work(fn,180000);
      samples.push(performance.now()-start);
    }
  }
  const nativeMs=median(nativeSamples),wasmMs=median(compiledSamples);
  const warmRatio=wasmMs/nativeMs;
  assert.ok(Number.isFinite(warmRatio)&&warmRatio>0);
  console.log(JSON.stringify({
    benchmark:'bounded coerced signed addition',
    callsPerSample:180000,repeats:13,
    nativeMedianMs:nativeMs,wasmMedianMs:wasmMs,warmRatio,
    nativeStartupMs,wasmStartupMs,
    startupRatio:wasmStartupMs/nativeStartupMs,
    wasmBytes:generated.wasmBytes,
    scope:'single Node process / VM cross-realm pilot; NOT a universal 2.5x gate'
  }));
});
