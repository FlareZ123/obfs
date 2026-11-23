'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
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

test('seeded additive/bitwise/conditional grammar fuzz preserves native and source-only clone',()=>{
  let fuzzState=0x4c957f2d;
  /** @returns {number} */
  const pick=()=>{
    fuzzState^=fuzzState<<13;
    fuzzState^=fuzzState>>>17;
    fuzzState^=fuzzState<<5;
    return fuzzState>>>0;
  };
  /** @param {string[]} names @returns {string} */
  function leaf(names){
    if((pick()%3)!==0)return names[pick()%names.length];
    return String(boundaries[pick()%boundaries.length]);
  }
  /**
   * Generate additions only in expressions whose *own parent* eventually
   * performs a bitwise ToInt32; never add an uncoerced conditional test.
   * @param {number} depth
   * @param {string[]} names
   * @param {boolean} coerced
   * @returns {string}
   */
  function tree(depth,names,coerced){
    if(depth===0)return leaf(names);
    const op=pick()%11;
    if(op<3&&coerced)return '('+tree(depth-1,names,true)+
      '+'+tree(depth-1,names,true)+')';
    if(op===3)return '('+tree(depth-1,names,false)+'?'+
      tree(depth-1,names,coerced)+':'+tree(depth-1,names,coerced)+')';
    if(op===4)return '(~'+tree(depth-1,names,true)+')';
    const bits=['&','|','^','<<','>>','>>>'];
    return '('+tree(depth-1,names,true)+bits[pick()%bits.length]+
      tree(depth-1,names,true)+')';
  }
  let pairs=0,decoded=0;
  for(let sample=0;sample<45;sample++){
    const names=['a','b','c','d'].slice(0,2+sample%3);
    const expression='((a+b)|'+tree(3+sample%2,names,true)+')';
    const source='function f('+names.join(',')+'){return '+
      expression+';}module.exports=f;';
    const native=load(source);
    for(let seed=0;seed<2;seed++){
      const generated=lowerWasmI32Functions(source,'commonjs',{
        seed:'additive-fuzz-'+sample+'/'+seed,names:['f'],
        conditionalStrategy:seed===0?'if':'select'
      });
      assert.equal(generated.functions,1,'rejected source: '+expression);
      const compiled=load(generated.code);
      const recovered=recoverPublicWasmExpression(generated.code,names);
      const cloned=load('function f('+names.join(',')+'){return '+
        recovered.expression+';}module.exports=f;');
      decoded++;
      for(let trial=0;trial<80;trial++){
        const args=names.map((_,index)=>trial<boundaries.length?
          boundaries[(trial+index)%boundaries.length]:(pick()|0));
        const expected=native(...args);
        assert.ok(Object.is(compiled(...args),expected),
          'Wasm/native '+sample+'/'+seed+'/'+trial);
        assert.ok(Object.is(cloned(...args),expected),
          'Bytecode/native '+sample+'/'+seed+'/'+trial);
        pairs++;
      }
    }
  }
  assert.equal(decoded,90);
  assert.equal(pairs,7200);
  console.log(JSON.stringify({seed:'0x4c957f2d',trees:45,variants:90,
    comparisons:7200,attack:'public-bytecode symbolic recovery'}));
});

test('explicit COO/SNO pipeline selections and ESM public import preserve coerced addition',async()=>{
  const common='function f(a,b){return ((a+b)|0)^(a>>>5);}module.exports=f;';
  const native=load(common);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])){
    const output=obfuscateFiles([{
      path:'kernel.cjs',sourceType:'commonjs',code:common
    }],{
      mode,seed:'additive-pipeline-'+mode,
      strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'kernel.cjs':['f']}
    });
    assert.equal(output.files[0].metrics.wasmI32Functions,1);
    const emitted=load(String(output.files[0].code));
    for(let i=0;i<100;i++){
      const a=i<boundaries.length?boundaries[i]:next();
      const b=i<boundaries.length?boundaries[boundaries.length-1-i]:next();
      assert.ok(Object.is(emitted(a,b),native(a,b)),mode+'/'+i);
    }
  }
  const esm='export function f(a,b){return ((a+b)|0)^(a>>>5);}';
  const emitted=lowerWasmI32Functions(esm,'module',{
    seed:'additive-esm',names:['f']
  });
  assert.equal(emitted.functions,1);
  const originalModule=await import('data:text/javascript;base64,'+
    Buffer.from(esm).toString('base64'));
  const rewrittenModule=await import('data:text/javascript;base64,'+
    Buffer.from(emitted.code).toString('base64'));
  for(let i=0;i<100;i++){
    const a=i<boundaries.length?boundaries[i]:next();
    const b=i<boundaries.length?boundaries[boundaries.length-1-i]:next();
    assert.ok(Object.is(rewrittenModule.f(a,b),originalModule.f(a,b)),'esm/'+i);
  }
});
