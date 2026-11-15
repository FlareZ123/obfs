'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {readArgs}=require('../src/cli');

/** @param {string} source @returns {(x:number)=>number} */
function load(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:2000});
  return /** @type {(x:number)=>number} */(/** @type {unknown} */(module.exports));
}

/** @param {number[]} arr @returns {number} */
function median(arr) {return [...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];}

let state=0x28ab4;
/** @returns {number} */
function random() {state^=state<<13;state^=state>>>17;state^=state<<5;return state|0;}

const candidates=[
  'function f(x){return (((x^137)&(x>>>3))|(x<<7));}',
  'function f(x){return ((x&255)^((x|0x1f4d)>>5));}',
  'function f(x){return (((x>>>1)^(x<<17))>>>3);}',
  'function f(x){return ((~x)&(x^(-2147483648)));}',
  'function f(x){return (x&(x|x))^(~(x^255));}'
];
const boundary=[-2147483648,2147483647,-1,0,1,255,256,65535,-0,NaN,Infinity,-Infinity,1.5,-1.5];

test('Wasm i32 compiler preserves bitvector results on typed inputs',()=>{
  let compared=0;
  for(let n=0;n<candidates.length;n++) {
    const source=candidates[n]+'module.exports=f;';
    const native=load(source);
    for(let seed=0;seed<24;seed++) {
      const result=lowerWasmI32Functions(source,'commonjs',{
        seed:'wasm-i32-'+n+'-'+seed,names:['f']});
      assert.equal(result.functions,1);
      assert.ok(result.wasmBytes>20);
      const obfuscated=load(result.code);
      for(const input of boundary) {
        assert.ok(Object.is(obfuscated(input),native(input)),n+'/'+seed+'/'+input);
        compared++;
      }
      for(let j=0;j<150;j++) {
        const input=random();
        assert.ok(Object.is(obfuscated(input),native(input)),n+'/'+seed+'/'+input);
        compared++;
      }
      // Independent attacker receives only the public emitted source. Its
      // WebAssembly bytes permit cloning the selected function immediately.
      const byteMatch=result.code.match(/Uint8Array\.from\((\[[0-9,]+\])\)/);
      assert.ok(byteMatch,'Public binary bytes must be recoverable');
      const bytes=Uint8Array.from(JSON.parse(byteMatch[1]));
      assert.ok(WebAssembly.validate(bytes));
      const attacker=/** @type {(x:number)=>number} */(new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.f);
      assert.equal(typeof attacker,'function');
      assert.equal(attacker(42)>>>0,obfuscated(42)>>>0);
    }
  }
  assert.equal(compared,5*24*(boundary.length+150));
  console.log('Wasm Int32 + seedless binary clone: '+compared+' input comparisons');
});

test('unsafe type/effect grammar and direct source observation decline',()=>{
  for(const source of [
    'function f(x){return x + 5;}module.exports=f;',
    'function f(x){return x^this.k;}module.exports=f;',
    'function f(x){return x.value^1;}module.exports=f;',
    'function f(x){return String(x)^1;}module.exports=f;',
    'async function f(x){return x^1;}module.exports=f;',
    'function f(x=3){return x^1;}module.exports=f;',
    'function f(x){return x^1;}module.exports=f.toString();',
    'const WebAssembly=globalThis.WebAssembly;function f(x){return x^1;}module.exports=f;',
    'function f(x){return eval("x")^1;}module.exports=f;'
  ]) {
    const out=lowerWasmI32Functions(source,'commonjs',{seed:'deny',names:['f']});
    assert.equal(out.functions,0,source);
    assert.equal(out.declined,1);
    assert.equal(out.code,source);
  }
});

test('ESM dependency graph uses hoisted lazy helper to avoid cyclic TDZ calls',()=>{
  const cycleSource="import {observed} from './callee.mjs';"+
    "export {observed};export function f(x){return x^1;}";
  const out=lowerWasmI32Functions(cycleSource,'module',{
    seed:'esm-cycle',names:['f']
  });
  assert.equal(out.functions,1);
  assert.match(out.code,/function _wi_[0-9a-f]+\(input\)\{/u);
  assert.ok(out.code.includes('WebAssembly.Module('));
  const published=obfuscateFiles([
    {path:'owner.mjs',sourceType:'module',code:cycleSource},
    {path:'callee.mjs',sourceType:'module',
      code:"import {f} from './owner.mjs';export const observed=f(42);"}
  ],{
    mode:'coo',seed:'cyclic-graph',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'owner.mjs':['f']}
  });
  assert.equal(published.files[0].metrics.wasmI32Functions,1);
  assert.ok(String(published.files[0].code).includes('WebAssembly.Module('));
});

test('COO/SNO selection, CLI parsing and top-level call preserve results',async()=>{
  const cjs='"use strict";\nfunction f(x){return x^175;}const answer=f(5);module.exports=answer;';
  const out=lowerWasmI32Functions(cjs,'commonjs',{seed:'init-before-call',names:['f']});
  const module={exports:null};
  vm.runInNewContext(out.code,{module,globalThis});
  assert.equal(module.exports,5^175);
  assert.ok(out.code.startsWith('"use strict";'));

  const parsed=readArgs(['--root','.', '--entry','kernel.cjs',
    '--wasm-i32','kernel.cjs:f']);
  assert.deepEqual(parsed.experimentalWasmI32,{'kernel.cjs':['f']});
  const transformed=obfuscateFiles([{path:'kernel.cjs',
    code:cjs,sourceType:'commonjs'}],{
    mode:'sno',seed:'pipeline',experimentalWasmI32:{'kernel.cjs':['f']}
  });
  assert.equal(transformed.files[0].metrics.wasmI32Functions,1);
  const outputModule={exports:null};
  vm.runInNewContext(String(transformed.files[0].code),{
    module:outputModule,globalThis
  });
  assert.equal(outputModule.exports,5^175);

  const esm='export function f(x){return ((x>>>1)^(x&255));}';
  const emitted=lowerWasmI32Functions(esm,'module',{seed:'esm',names:['f']});
  assert.equal(emitted.functions,1);
  const imported=await import('data:text/javascript;base64,'+
    Buffer.from(emitted.code).toString('base64'));
  assert.equal(imported.f(-125),((-125>>>1)^(-125&255)));
});

/** @param {(x:number)=>number} fn @param {number} n @returns {number} */
function work(fn,n) {
  let sum=0;
  for(let i=0;i<n;i++)sum^=fn((i*1664525)|0);
  return sum|0;
}

test('record native versus Wasm warm hot/cold costs without universal assertion',()=>{
  const source='function f(x){return (((x^137)&(x>>>3))|(x<<7));}module.exports=f;';
  const original=load(source);
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'benchmark',names:['f']});
  const start=performance.now();
  const transformed=load(lowered.code);
  const initMs=performance.now()-start;
  for(let i=0;i<6;i++) {
    assert.equal(work(original,150000),work(transformed,150000));
  }
  /** @type {number[]} */
  const native=[];
  /** @type {number[]} */
  const wasm=[];
  for(let trial=0;trial<17;trial++) {
    /** @type {[((x:number)=>number),number[]][]} */
    const order=trial%2===0?[[original,native],[transformed,wasm]]:
      [[transformed,wasm],[original,native]];
    for(const [fn,times] of order) {
      const t=performance.now();
      work(fn,150000);
      times.push(performance.now()-t);
    }
  }
  const ratio=median(wasm)/median(native);
  console.log(JSON.stringify({initMs,hotRatio:ratio,nativeMedianMs:median(native),
    wasmMedianMs:median(wasm),wasmBytes:lowered.wasmBytes}));
  assert.ok(Number.isFinite(ratio));
});
