'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/**
 * Load an original or lowered CommonJS integer function.
 * @param {string} code
 * @returns {(...args:number[])=>number}
 */
function load(code){
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */ (/** @type {unknown} */ (module.exports));
}

/** @param {number[]} values @returns {number} */
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}

const cases=[
  {name:'mix2',arity:2,
    expression:'(((a^b)&(a>>>3))|((b<<5)^0x23e1))',
    parameters:'a,b'},
  {name:'mix3',arity:3,
    expression:'(((a>>>b)^(b<<c))&(~c|a))',
    parameters:'a,b,c'},
  {name:'mix4',arity:4,
    expression:'(((a^b)&(c|d))^((a>>>d)|(c<<b)))',
    parameters:'a,b,c,d'},
  {name:'unsigned4',arity:4,
    expression:'((a^b)>>>((c&7)|d))',
    parameters:'a,b,c,d',unsigned:true}
];
const boundaries=[-2147483648,2147483647,-1,0,1,31,32,255,65535];
let randomState=0x5417d69;
/** @returns {number} */
function randomI32(){
  randomState^=randomState<<13;
  randomState^=randomState>>>17;
  randomState^=randomState<<5;
  return randomState|0;
}

/** @param {string} source @returns {Uint8Array} */
function extractPublicBinary(source){
  const encoded=source.match(/Uint8Array\.from\((\[[0-9,]+\])\)/u);
  assert.ok(encoded,'Wasm bytecode must be present in public output');
  return Uint8Array.from(JSON.parse(encoded[1]));
}

test('2-4 typed parameters preserve native signed/unsigned results and enable public binary cloning',()=>{
  let comparisons=0;
  for(const candidate of cases){
    const source='function f('+candidate.parameters+'){return '+candidate.expression+';}module.exports=f;';
    const native=load(source);
    for(let seed=0;seed<12;seed++){
      const emitted=lowerWasmI32Functions(source,'commonjs',{
        seed:'multiparam-'+candidate.name+'-'+seed,names:['f']
      });
      assert.equal(emitted.functions,1);
      assert.equal(emitted.declined,0);
      const transformed=load(emitted.code);
      const binary=extractPublicBinary(emitted.code);
      assert.ok(WebAssembly.validate(binary));
      const cloned=/** @type {(...args:number[])=>number} */ (
        new WebAssembly.Instance(new WebAssembly.Module(binary)).exports.f);
      assert.equal(cloned.length,candidate.arity);
      for(const a of boundaries){
        const args=Array.from({length:candidate.arity},(_,i)=>i%2?a^0x12345:a);
        const expected=native(...args);
        assert.equal(transformed(...args),expected);
        assert.equal(candidate.unsigned?(cloned(...args)>>>0):cloned(...args),expected);
        comparisons++;
      }
      for(let i=0;i<100;i++){
        const args=Array.from({length:candidate.arity},randomI32);
        const expected=native(...args);
        assert.equal(transformed(...args),expected);
        assert.equal(candidate.unsigned?(cloned(...args)>>>0):cloned(...args),expected);
        comparisons++;
      }
    }
  }
  assert.equal(comparisons,cases.length*12*(boundaries.length+100));
  console.log('Multi-argument Wasm differential and independent public-byte clone: '+comparisons);
});

test('zero, five, duplicate, default, rest, destructured and effectful parameters decline',()=>{
  const invalid=[
    'function f(){return 9^2;}',
    'function f(a,b,c,d,e){return a^e;}',
    'function f(a,a){return a^1;}',
    'function f(a,b=3){return a^b;}',
    'function f(a,...values){return a^values;}',
    'function f(a,{b}){return a^b;}',
    'function f(a,b){return a^b.value;}',
    'function f(a,b){return a^eval("b");}',
    'function f(a,b){return a^b;}module.exports=f.toString();'
  ];
  for(const source of invalid){
    const emitted=lowerWasmI32Functions(source,'commonjs',{seed:'decline',names:['f']});
    assert.equal(emitted.functions,0,source);
    assert.equal(emitted.declined,1,source);
    assert.equal(emitted.code,source);
  }
});

test('selected multi-parameter kernels integrate with COO ESM and SNO CommonJS',async()=>{
  const original='export function mix(a,b,c){return ((a^b)&(c>>>2))|(b<<c);}';
  const transformed=obfuscateFiles([
    {path:'mix.mjs',sourceType:'module',code:original}
  ],{
    mode:'coo',seed:'multi-esm',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'mix.mjs':['mix']}
  });
  assert.equal(transformed.files[0].metrics.wasmI32Functions,1);
  const native=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
  const encoded=await import('data:text/javascript;base64,'+
    Buffer.from(String(transformed.files[0].code)).toString('base64'));
  for(let i=0;i<512;i++){
    const args=[randomI32(),randomI32(),randomI32()];
    assert.equal(encoded.mix(...args),native.mix(...args));
  }
  const cjs='function f(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}module.exports=f;';
  const sno=obfuscateFiles([{path:'f.cjs',sourceType:'commonjs',code:cjs}],{
    mode:'sno',seed:'multi-sno',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'f.cjs':['f']}
  });
  assert.equal(sno.files[0].metrics.wasmI32Functions,1);
  const nativeCjs=load(cjs),protectedCjs=load(String(sno.files[0].code));
  for(let i=0;i<512;i++){
    const args=[randomI32(),randomI32(),randomI32(),randomI32()];
    assert.equal(protectedCjs(...args),nativeCjs(...args));
  }
});

test('multi-parameter Wasm warm and cold costs are workload evidence, not universal protection',()=>{
  const source='function f(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}module.exports=f;';
  const native=load(source);
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'multi-performance',names:['f']
  });
  const start=performance.now();
  const emitted=load(lowered.code);
  const coldMs=performance.now()-start;
  /** @param {(...args:number[])=>number} fn @param {number} iterations @returns {number} */
  function workload(fn,iterations){
    let sum=0;
    for(let i=0;i<iterations;i++){
      sum^=fn(i|0,(i*1664525)|0,(i*1013904223)|0,((i>>>3)&31)|0);
    }
    return sum|0;
  }
  for(let i=0;i<5;i++)assert.equal(workload(native,120000),workload(emitted,120000));
  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const protectedTimes=[];
  for(let trial=0;trial<13;trial++){
    const pair=trial%2?[[emitted,protectedTimes],[native,nativeTimes]]:
      [[native,nativeTimes],[emitted,protectedTimes]];
    for(const [fn,values] of /** @type {Array<[(...args:number[])=>number,number[]]>} */ (pair)){
      const then=performance.now();
      workload(fn,120000);
      values.push(performance.now()-then);
    }
  }
  const ratio=median(protectedTimes)/median(nativeTimes);
  assert.ok(Number.isFinite(ratio));
  console.log(JSON.stringify({candidate:'four-argument-wasm-i32',coldMs,
    nativeMedianMs:median(nativeTimes),protectedMedianMs:median(protectedTimes),
    hotRatio:ratio,wasmBytes:lowered.wasmBytes}));
});
