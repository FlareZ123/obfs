'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute one classic script and observe its externally reachable global
 * function's exact source.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function execute(code) {
  const context=vm.createContext({});
  vm.runInContext(code,context,{filename:'global-api.js',timeout:1000});
  return {
    value:context.result,
    source:/** @type {Function} */ (context.publicGlobal).toString()
  };
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' classic-script global callable source remains observable after string encoding',()=>{
    const source=[
      "function publicGlobal(){return 'global-source-visible-token';}",
      'function invokeGlobal(){return publicGlobal();}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{
      path:'global-api.js',sourceType:'script',code:source
    }],{
      mode,seed:'classic-global-callable-source/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(output.files[0].metrics.literals>0,output.files[0].code);
    const native=execute(source);
    const emitted=execute(output.files[0].code);
    assert.equal(native.value,'global-source-visible-token');
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/global-source-visible-token/);
    assert.doesNotMatch(emitted.source,/global-source-visible-token/);
    assert.notEqual(emitted.source,native.source);
  });
}
