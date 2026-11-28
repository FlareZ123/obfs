'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

const base='function f(x){return x^17;}';
const observed=base+'module.exports=CSS.escape(f);';

/**
 * CSS.escape accepts a DOMString, so a function input is converted through
 * Function#toString. Node has no global CSS object; the isolated host mock
 * deliberately models only the DOMString conversion (not CSS escaping).
 * Its exact native-vs-emitted source discrepancy is the relevant property.
 * @param {string} source
 * @returns {unknown}
 */
function observe(source){
  const module={exports:null};
  const context={module,WebAssembly,Uint8Array,Buffer,
    CSS:{escape(value){return String(value);}}};
  vm.runInNewContext(source,context,{timeout:4000});
  return module.exports;
}

test('CSS.escape DOMString argument captures an exact native function source',()=>{
  assert.equal(observe(observed),'function f(x){return x^17;}');
  const lowered=lowerWasmI32Functions(base,'commonjs',{
    seed:'css-escape-source-positive',names:['f']
  });
  assert.equal(lowered.functions,1,'positive must really alter the function');
  assert.notEqual(observe(lowered.code+'module.exports=CSS.escape(f);'),observe(observed));
});

test('CSS.escape selected Wasm function must be rejected before source rewrite',()=>{
  const lowered=lowerWasmI32Functions(observed,'commonjs',{
    seed:'css-escape-source-negative',names:['f']
  });
  assert.equal(lowered.functions,0,'CSS.escape(f) observes Function#toString');
  assert.equal(lowered.declined,1);
  assert.equal(lowered.code,observed);
});

test('three-mode compiler must not silently emit source-changing selected Wasm',()=>{
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    assert.throws(()=>obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:observed
    }],{
      mode,seed:'css-escape-mode-'+mode,strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['f']}
    }),/Wasm|declined|source/i,'mode '+mode+' must not obfuscate an observable function');
  }
});
