'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @type {Array<[string,'commonjs'|'module',string,string]>} */
const fixtures=[
  ['CJS three-name immutable alias chain','commonjs',
    'function calculate(x){return x+1;}'+
    'const first=calculate;const second=first;module.exports=second;',
    'function calculate(x){return x+1;}'],
  ['CJS alias to object containing callable reference','commonjs',
    'function calculate(x){return x+1;}'+
    'const api={run:calculate};const alias=api;module.exports=alias;',
    'function calculate(x){return x+1;}'],
  ['ESM exported function via immutable alias chain','module',
    'function calculate(x){return x+1;}'+
    'const first=calculate;const second=first;export {second as calculate};',
    'function calculate(x){return x+1;}'],
  ['ESM exported object that references function by alias','module',
    'function calculate(x){return x+1;}'+
    'const first=calculate;const api={run:first};export {api};',
    'function calculate(x){return x+1;}']
];

for(const [name,sourceType,source,preserved] of fixtures){
  test('direct immutable export-alias chain retains callable source: '+name,()=>{
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const output=obfuscateFiles([{
        path:sourceType==='module'?'entry.mjs':'entry.cjs',
        sourceType,code:source
      }],{mode,identifiers:true,strings:false,properties:true,
        seed:'agent9-public-alias/'+name+'/'+mode}).files[0];
      assert.ok(String(output.code).includes(preserved),
        mode+' changed the callable native source through an immutable direct export alias: '+
          output.code);
    }
  });
}
