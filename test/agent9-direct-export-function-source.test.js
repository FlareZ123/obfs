'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {unknown} */
function load(code){
  const module={exports:/** @type {unknown} */({})};
  const context={module,exports:module.exports};
  vm.runInNewContext(code,context,{timeout:1500});
  return module.exports;
}

/** @type {Array<[string,string,string,(result:unknown)=>Function]>} */
const commonJs=[
  ['direct anonymous export','module.exports=function calculate(x){return x+1;};',
    'function calculate(x){return x+1;}',
    value=>/** @type {Function} */(value)],
  ['top-level declaration exported by name',
    'function calculate(x){return x+1;}module.exports=calculate;',
    'function calculate(x){return x+1;}',
    value=>/** @type {Function} */(value)],
  ['top-level arrow binding exported by name',
    'const calculate=(x)=>x+1;module.exports=calculate;',
    '(x)=>x+1',
    value=>/** @type {Function} */(value)],
  ['function nested in object export',
    'module.exports={api:{calculate:function calculate(x){return x+1;}}};',
    'function calculate(x){return x+1;}',
    value=>/** @type {{api:{calculate:Function}}} */(value).api.calculate],
  ['named export property assignment',
    'exports.calculate=(x)=>x+1;',
    '(x)=>x+1',
    value=>/** @type {{calculate:Function}} */(value).calculate],
  ['nested private lexical arrow inside directly exported wrapper',
    'module.exports=function calculate(x){const bump=(n)=>n+1;return bump(x);};',
    'function calculate(x){const bump=(n)=>n+1;return bump(x);}',
    value=>/** @type {Function} */(value)]
];

for(const [label,source,expectedSource,select] of commonJs){
  test('direct public callable identifier/source contract: '+label,()=>{
    const native=/** @type {(x:number)=>unknown} */(select(load(source)));
    assert.equal(Function.prototype.toString.call(native),expectedSource);
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const compiled=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{mode,identifiers:true,strings:true,properties:true,
        seed:'agent9-direct-public-identifier/'+label+'/'+mode}).files[0];
      const emitted=/** @type {(x:number)=>unknown} */(select(load(String(compiled.code))));
      assert.equal(Function.prototype.toString.call(emitted),expectedSource);
      assert.equal(emitted.name,native.name);
      assert.equal(emitted.length,native.length);
      for(const x of [-2,0,1,7,44])assert.equal(emitted(x),native(x));
    }
  });
}

for(const [label,source,expected] of /** @type {Array<[string,string,string]>} */([
  ['ESM exported function declaration',
    'export function calculate(x){return x+1;}',
    'function calculate(x){return x+1;}'],
  ['ESM exported const arrow',
    'export const calculate=(x)=>x+1;',
    '(x)=>x+1'],
  ['ESM named specifier export of const arrow',
    'const calculate=(x)=>x+1;export {calculate};',
    '(x)=>x+1'],
  ['ESM default function declaration',
    'export default function calculate(x){return x+1;}',
    'function calculate(x){return x+1;}'],
  ['ESM named object export with nested function',
    'export const api={calculate:(x)=>x+1};',
    '(x)=>x+1']
])){
  test('ESM direct public function source is not identifier-mangled: '+label,()=>{
    const result=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{mode:'coo',identifiers:true,strings:false,properties:true,
      seed:'agent9-esm-direct-public/'+label}).files[0];
    assert.ok(String(result.code).includes(expected),
      'source spelling of publicly exported callable must remain: '+result.code);
  });
}

test('nonexported pure helper can still rename its private parameter',()=>{
  const source='const helper=(value)=>value+1;module.exports=helper(41);';
  const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'coo',identifiers:true,strings:false,properties:true,
    seed:'agent9-direct-public-private-control'
  }).files[0];
  assert.equal(load(String(result.code)),42);
  assert.ok(result.metrics.bindings>0);
});
