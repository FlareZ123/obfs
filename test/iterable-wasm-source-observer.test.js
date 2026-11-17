'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {unknown} */
function execute(code) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module',code)(module);
  return module.exports;
}

const source='function f(a){return a^17;}';

for(const [name,tail] of [
  ['Set insertion', 'module.exports=[...new Set([f])].join(",");'],
  ['Map value iterator',
    'module.exports=Array.from(new Map([[0,f]]).values()).join(",");'],
  ['Map key iterator',
    'module.exports=[...new Map([[f,0]]).keys()].join(",");'],
  ['Set union',
    'module.exports=[...new Set([f]).union(new Set())].join(",");'],
  ['Map forEach collection alias',
    'let output="";new Map([[0,f]]).forEach((v,k,m)=>{output=[...m.values()].join(",");});'+
      'module.exports=output;']
]) {
  test('Wasm source rewrite declines '+name,()=>{
    const code=source+tail;
    assert.ok(String(execute(code)).includes('function f(a)'));
    const output=lowerWasmI32Functions(code,'commonjs',{
      seed:'iterable-wasm-source/'+name,names:['f']
    });
    assert.equal(output.functions,0,'Must not change source');
    assert.equal(output.declined,1,'Must record conservative decline');
    assert.equal(output.code,code);
    assert.deepEqual(execute(output.code),execute(code));
    assert.throws(()=>obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code}
    ],{
      mode:'sno',seed:'integrated-iterable-wasm-source/'+name,
      strings:false,properties:false,identifiers:false,
      experimentalWasmI32:{'entry.cjs':['f']}
    }),/Wasm i32 declined/u);
  });
}

test('primitive-only Set values preserve genuine Wasm i32 lowering',()=>{
  const code=source+
    'const set=new Set([1,2]).union(new Set([3]));'+
    'module.exports=[f(8),[...set].join(",")];';
  const output=lowerWasmI32Functions(code,'commonjs',{
    seed:'iterable-wasm-primitive-positive',names:['f']
  });
  assert.equal(output.functions,1);
  assert.equal(output.declined,0);
  assert.deepEqual(execute(output.code),execute(code));
});
