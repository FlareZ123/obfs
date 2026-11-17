'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {readArgs}=require('../src/cli');

/**
 * Execute one generated CommonJS source under a counting, otherwise native
 * WebAssembly implementation. The counter observes compilation only.
 * @param {string} source
 * @returns {{exports:{hot:(x:number)=>number,cold:(x:number)=>number,initial?:number},compiled:()=>number}}
 */
function loadCounting(source) {
  let count=0;
  const host={
    Uint8Array,
    WebAssembly:{
      Instance:WebAssembly.Instance,
      Module:class extends WebAssembly.Module {
        /** @param {BufferSource} bytes */
        constructor(bytes) {
          super(bytes);
          count++;
        }
      }
    }
  };
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module,globalThis:host},{timeout:3000});
  return {
    exports:/** @type {{hot:(x:number)=>number,cold:(x:number)=>number,initial?:number}} */(module.exports),
    compiled:()=>count
  };
}

test('CommonJS opted-in deferred Wasm compiles only invoked functions on first use',()=>{
  const source='"use strict";'+
    'function hot(x){return (x^17)>>2;}'+
    'function cold(x){return (x<<3)^7;}'+
    'module.exports={hot,cold};';
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'lazy-commonjs-first-call',names:['hot','cold'],
    deferCommonJsInitialization:true
  });
  assert.equal(lowered.functions,2);
  assert.equal(lowered.declined,0);
  const runtime=loadCounting(lowered.code);
  assert.equal(runtime.compiled(),0,'Unused functions must not compile at module load');
  for(const x of [-2147483648,-1,0,1,2147483647]) {
    assert.equal(runtime.exports.hot(x),(x^17)>>2);
  }
  assert.equal(runtime.compiled(),1,'Repeat calls must reuse the compiled Wasm export');
  for(const x of [-2147483648,-1,0,1,2147483647]) {
    assert.equal(runtime.exports.cold(x),(x<<3)^7);
  }
  assert.equal(runtime.compiled(),2,'Second function compiles only on first use');
});

test('CommonJS lazy helper remains callable during top-level module initialization',()=>{
  const source='"use strict";'+
    'function hot(x){return x^13;}'+
    'function cold(x){return x&255;}'+
    'const initial=hot(42);module.exports={hot,cold,initial};';
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'lazy-commonjs-top-level',names:['hot','cold'],
    deferCommonJsInitialization:true
  });
  assert.equal(lowered.functions,2);
  const runtime=loadCounting(lowered.code);
  assert.equal(runtime.compiled(),1,
    'A called-before-export function must compile exactly once at top level');
  assert.equal(runtime.exports.initial,42^13);
  assert.equal(runtime.exports.hot(11),11^13);
  assert.equal(runtime.compiled(),1);
  assert.equal(runtime.exports.cold(300),300&255);
  assert.equal(runtime.compiled(),2);
});


test('CommonJS default eager setup remains available for server initialization',()=>{
  const source='function hot(x){return x^17;}'+
    'function cold(x){return x&255;}module.exports={hot,cold};';
  const eager=lowerWasmI32Functions(source,'commonjs',{
    seed:'commonjs-default-eager',names:['hot','cold']
  });
  assert.equal(eager.functions,2);
  const runtime=loadCounting(eager.code);
  assert.equal(runtime.compiled(),2,'Server initialization compiles both functions');
  assert.equal(runtime.exports.hot(4),4^17);
  assert.equal(runtime.exports.cold(300),300&255);
  assert.equal(runtime.compiled(),2);
  assert.throws(()=>lowerWasmI32Functions(source,'commonjs',{
    seed:'bad-deferred-flag',names:['hot'],
    deferCommonJsInitialization:/** @type {boolean} */(/** @type {unknown} */('yes'))
  }),/Expected source/u);
});

test('SNO group API and CLI retain eager initialization after runtime budget falsifier',()=>{
  const source='function hot(x){return x^17;}function cold(x){return x&255;}'+
    'module.exports={hot,cold};';
  const selected={'entry.cjs':['hot','cold']};
  const emitted=obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ],{
    mode:'sno',seed:'sno-eager-budget-default',strings:false,
    identifiers:false,properties:false,experimentalWasmI32:selected
  });
  assert.equal(emitted.files[0].metrics.wasmI32Functions,2);
  const runtime=loadCounting(String(emitted.files[0].code));
  assert.equal(runtime.compiled(),2,
    'SNO output must compile selected Wasm during allowed server initialization');
  assert.equal(runtime.exports.hot(3),3^17);
  assert.equal(runtime.compiled(),2);

  const opts=readArgs(['--root','.','--entry','entry.cjs',
    '--wasm-i32','entry.cjs:hot']);
  assert.deepEqual(opts.experimentalWasmI32,{'entry.cjs':['hot']});
  assert.throws(()=>readArgs(['--root','.','--entry','entry.cjs',
    '--wasm-i32','entry.cjs:hot','--wasm-i32-defer-commonjs']),
    /Unknown option/u);
});
