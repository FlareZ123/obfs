'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @param {string} source @returns {unknown} */
function execute(source) {
  const module={exports:undefined};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return module.exports;
}

const original='function f(a){return a^17;}';
const observers=[
  {name:'RegExp test',code:'module.exports=/a\\^17/.test(f);'},
  {name:'RegExp Symbol.match',code:'module.exports=/a\\^17/[Symbol.match](f)?.[0]??null;'},
  {name:'native String receiver',code:
    'module.exports=String.prototype.includes.call(f,"a^17");'},
  {name:'String.raw substituted function',code:
    'module.exports=String.raw({raw:["",""]},f).includes("a^17");'},
  {name:'String.raw tagged template',code:
    'module.exports=String.raw`before${f}after`.includes("a^17");'},
  {name:'String Symbol.iterator function receiver',code:
    'module.exports=Array.from(String.prototype[Symbol.iterator].call(f)).join("").includes("a^17");'},
  {name:'Object.groupBy Function callback key',code:
    'module.exports=Object.keys(Object.groupBy([1],()=>f))[0].includes("a^17");'}
];

test('source rewrite alone measurably changes native source-text observers in the absence of their companion guard',()=>{
  const lowered=lowerWasmI32Functions(original,'commonjs',{
    seed:'source-observer-counterfactual',names:['f']
  });
  assert.equal(lowered.functions,1,'Isolated function must be genuinely lowered');
  assert.equal(lowered.declined,0);
  assert.notEqual(lowered.code,original);
  for(const item of observers){
    const native=execute(original+item.code);
    const transformed=execute(lowered.code+item.code);
    assert.ok(native,'Native source observer must recognize f: '+item.name);
    assert.notDeepEqual(transformed,native,
      'The isolated rewrite must expose a real semantic difference: '+item.name);
    console.log(JSON.stringify({kind:item.name,native,transformed}));
  }
});
