'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A host-realm queueMicrotask replacement reads the supplied function source
 * synchronously and deliberately never invokes the callback.
 * @param {string} code
 * @returns {{value:unknown,source:string|null,invoked:boolean}}
 */
function observe(code){
  const observed={source:null,invoked:false};
  /** @type {{module:{exports:unknown},queueMicrotask:(callback:Function)=>void}} */
  const context={
    module:{exports:null},
    queueMicrotask(callback){
      observed.source=Function.prototype.toString.call(callback);
    }
  };
  vm.runInNewContext(code,context,{timeout:2500});
  return {value:context.module.exports,...observed};
}

for(const mode of /** @type {const} */ (['coo','sno'])){
  test(mode+' host-held callable source must veto formal-parameter identifier rewriting',()=>{
    const source=[
      'function hidden(inputValue){return inputValue+1;}',
      'queueMicrotask(hidden);',
      'module.exports=0;'
    ].join('\n');
    const native=observe(source);
    assert.deepEqual(native,{
      value:0,
      source:'function hidden(inputValue){return inputValue+1;}',
      invoked:false
    });
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-host-held-identifier-'+mode,
      identifiers:true,strings:false,properties:false
    }).files[0];
    assert.equal(output.metrics.bindings,0,
      mode+': a host-held callable source must not receive renamed formal parameters');
    assert.deepEqual(observe(String(output.code)),native,
      mode+': Function#toString must preserve the original parameter spelling');
  });

  test(mode+' host-held callable source must veto string-literal encoding inside the function',()=>{
    const source=[
      "function hidden(){return 'callbackSourceLiteral';}",
      'queueMicrotask(hidden);',
      "module.exports='unrelatedLiteral'.length;"
    ].join('\n');
    const native=observe(source);
    assert.deepEqual(native,{
      value:'unrelatedLiteral'.length,
      source:"function hidden(){return 'callbackSourceLiteral';}",
      invoked:false
    });
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-host-held-string-'+mode,
      identifiers:false,strings:true,properties:false
    }).files[0];
    assert.equal(output.metrics.literals,0,
      mode+': strings inside a host-held callable must remain source-identical');
    assert.deepEqual(observe(String(output.code)),native,
      mode+': Function#toString must preserve the original string literal spelling');
  });
}
