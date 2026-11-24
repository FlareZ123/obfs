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
  test(mode+' red control: host-held callable reveals formal-parameter identifier rewrite',()=>{
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
    const transformed=observe(String(output.code));
    assert.ok(output.metrics.bindings>=1,
      mode+': expected current identifier transform to run');
    assert.notEqual(transformed.source,native.source,
      mode+': host must not observe renamed callback parameters');
    assert.equal(transformed.value,native.value,
      mode+': executable return value remains equal despite source disclosure');
    assert.equal(transformed.invoked,false,
      mode+': host did not invoke the callback');
    console.log('AGENT9_HOST_HELD_IDENTIFIER '+JSON.stringify({
      mode,bindings:output.metrics.bindings,native:native.source,
      emitted:transformed.source,invoked:transformed.invoked
    }));
  });

  test(mode+' red control: host-held callable reveals string-literal encoding inside the function',()=>{
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
    const transformed=observe(String(output.code));
    assert.ok(output.metrics.literals>=1,
      mode+': expected current string transform to run');
    assert.notEqual(transformed.source,native.source,
      mode+': host must not observe encoded callback string literals');
    assert.equal(transformed.value,native.value,
      mode+': executable return value remains equal despite source disclosure');
    assert.equal(transformed.invoked,false,
      mode+': host did not invoke the callback');
    console.log('AGENT9_HOST_HELD_STRING '+JSON.stringify({
      mode,literals:output.metrics.literals,native:native.source,
      emitted:transformed.source,invoked:transformed.invoked
    }));
  });
}
