'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {unknown} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

/**
 * Compare original and property-obfuscated CommonJS.
 * @param {string} source
 * @param {number} objects
 */
function verify(source,objects) {
  const result=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'inherited-patterns',identifiers:false,strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(source),result.code);
  assert.equal(result.metrics.objects,objects,result.code);
}

test('inherited getter accessed by destructuring observes original own keys',()=>{
  verify(`Object.defineProperty(Object.prototype,'inspect',{
    get(){return Object.keys(this)[0]}
  });const a={secretField:3};const {inspect}=a;
    module.exports=[inspect,a.secretField].join(',');`,0);
});

test('known own key destructuring can still be renamed despite a prototype getter',()=>{
  verify(`Object.defineProperty(Object.prototype,'secretField',{get(){return 91}});
    const a={secretField:8};const {secretField}=a;
    module.exports=secretField;`,1);
});
