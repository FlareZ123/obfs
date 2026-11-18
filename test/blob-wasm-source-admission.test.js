'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const module={exports:/** @type {unknown} */(null)};
  new Function('module',code)(module);
  return String(typeof module.exports==='function'?
    /** @type {()=>unknown} */(module.exports)():module.exports);
}

const functionSource='function f(a){return a^17;}';
const unguarded=lowerWasmI32Functions(functionSource,'commonjs',{
  seed:'blob-wasm-source-counterfactual',names:['f']
});
assert.equal(unguarded.functions,1,'Counterfactual must emit a real Wasm function');
assert.equal(unguarded.declined,0);

/** @type {Array<[string,string]>} */
const observers=[
  ['Blob options.type','new Blob([],{type:f}).type'],
  ['Blob options.endings','(()=>{try{new Blob([],{endings:f});return "unexpected";}'+
    'catch(error){return error.message;}})()'],
  ['Blob bound constructor','new (Blob.bind(null))([],{type:f}).type'],
  ['Blob prebound options','new (Blob.bind(null,[],{type:f}))().type'],
  ['Blob bound owner property','(()=>{const registry={Make:Blob.bind(null)};'+
    'return new registry.Make([],{type:f}).type;})()'],
  ['Blob reflective construct','Reflect.construct(Blob,[[],{type:f}]).type'],
  ['Blob reflective bound construct',
    'Reflect.construct(Blob.bind(null),[[],{type:f}]).type']
];

for(const [name,expression] of observers) {
  test('selected Wasm lowering changes native Blob function source: '+name,()=>{
    const body='module.exports='+expression+';';
    const native=evaluate(functionSource+body);
    const altered=evaluate(unguarded.code+body);
    assert.notEqual(native,altered,
      name+' must witness an actual Wasm-induced source change');
    assert.match(native,/f\(a\)/iu,name);
  });

  test('SNO rejects selected Wasm when Blob observes original function: '+name,()=>{
    const code=functionSource+'module.exports='+expression+';';
    assert.equal(observesFunctionSource(parse(code,'commonjs')),true);
    assert.throws(()=>obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code
    }],{mode:'sno',seed:'blob-wasm-guard',strings:false,
      experimentalWasmI32:{'entry.cjs':['f']}}),
    /Wasm i32 requires|declined/i);
  });
}

test('primitive Blob options retain selected Wasm i32 conversion',()=>{
  const original=functionSource+
    'const type=new Blob([],{type:"text/plain",endings:"transparent"}).type;'+
    'module.exports=()=>f(37)+":"+type;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  const output=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'blob-wasm-primitive',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'entry.cjs':['f']}});
  assert.equal(evaluate(String(output.files[0].code)),evaluate(original));
  assert.match(String(output.files[0].code),/WebAssembly/u,
    'The positive control must emit a genuine Wasm runtime');
});
