'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function run(source){
  const module={exports:undefined};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return module.exports;
}

const examples=[
  {
    name:'regular expression literal test',
    tail:'module.exports=/a\\^17/.test(f);'
  },
  {
    name:'aliased regular expression literal test',
    tail:'const matcher=/a\\^17/;const alias=matcher;module.exports=alias.test(f);'
  },
  {
    name:'constructed regular expression exec',
    tail:'const match=new RegExp("a\\\\^17").exec(f);module.exports=match?.[0]??null;'
  }
];

test('native RegExp text-matching consumes exact function source and must decline Wasm source rewrites',()=>{
  for(const entry of examples){
    const source='function f(a){return a^17;}'+entry.tail;
    const native=run(source);
    assert.ok(native,'Positive native source observer: '+entry.name);
    const result=lowerWasmI32Functions(source,'commonjs',{
      seed:'regexp-function-source-observer-'+entry.name,names:['f']
    });
    assert.equal(result.functions,0,'Must decline: '+entry.name);
    assert.equal(result.declined,1,'Must record decline: '+entry.name);
    assert.equal(result.code,source,'Must preserve source: '+entry.name);
    assert.deepEqual(run(result.code),native,'Native/generator parity: '+entry.name);
  }
});

test('explicit Wasm selection rejects RegExp function-source consumers',()=>{
  const source='function f(a){return a^17;}module.exports=/a\\^17/.test(f);';
  assert.throws(()=>obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ],{
    mode:'sno',seed:'regex-observer-integration',strings:false,
    identifiers:false,properties:false,experimentalWasmI32:{'entry.cjs':['f']}
  }),/Wasm i32 declined/u);
});

test('RegExp of a known static primitive remains a genuine transformed positive control',()=>{
  const source='function f(a){return a^17;}module.exports=[f(3),/a\\^17/.test("a^17")];';
  const result=lowerWasmI32Functions(source,'commonjs',{
    seed:'regex-static-primitive-positive',names:['f']
  });
  assert.equal(result.functions,1);
  assert.equal(result.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(run(result.code))),
    Array.from(/** @type {unknown[]} */(run(source))));
});
