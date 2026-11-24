'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {{value:unknown,hiddenSource:string|null,safeSource:string,invoked:boolean}}
 */
function observe(code){
  const observed={hiddenSource:null,invoked:false};
  /** @type {{module:{exports:{value:unknown,safe:Function}|null},queueMicrotask:(callback:Function)=>void}} */
  const context={
    module:{exports:null},
    queueMicrotask(callback){
      observed.hiddenSource=Function.prototype.toString.call(callback);
    }
  };
  vm.runInNewContext(code,context,{timeout:2500});
  assert.ok(context.module.exports);
  return {
    value:context.module.exports.value,
    hiddenSource:observed.hiddenSource,
    safeSource:Function.prototype.toString.call(context.module.exports.safe),
    invoked:observed.invoked
  };
}

for(const mode of /** @type {const} */ (['coo','sno'])){
  test(mode+' precision diagnostic: source observer currently rewrites both observed and unrelated function identifiers',()=>{
    const source=[
      'function hidden(inputValue){return inputValue+1;}',
      'function safe(safeValue){return safeValue+2;}',
      'queueMicrotask(hidden);',
      'module.exports={value:safe(1),safe};'
    ].join('\n');
    const native=observe(source);
    assert.equal(native.value,3);
    assert.equal(native.hiddenSource,'function hidden(inputValue){return inputValue+1;}');
    assert.equal(native.safeSource,'function safe(safeValue){return safeValue+2;}');
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-host-held-precision-identifier-'+mode,
      identifiers:true,strings:false,properties:false
    }).files[0];
    const transformed=observe(String(output.code));
    assert.notEqual(transformed.hiddenSource,native.hiddenSource,
      'current behavior: observed callback source is changed');
    assert.notEqual(transformed.safeSource,native.safeSource,
      'current behavior: unrelated function source is also changed');
    assert.equal(transformed.value,native.value);
    assert.equal(transformed.invoked,false);
    console.log('AGENT9_HOST_HELD_PRECISION_IDENTIFIER '+JSON.stringify({
      mode,bindings:output.metrics.bindings,
      hiddenSourceEqual:transformed.hiddenSource===native.hiddenSource,
      safeSourceChanged:transformed.safeSource!==native.safeSource,
      nativeHidden:native.hiddenSource,emittedHidden:transformed.hiddenSource,
      nativeSafe:native.safeSource,emittedSafe:transformed.safeSource
    }));
  });

  test(mode+' precision diagnostic: source observer currently encodes both observed and unrelated function strings',()=>{
    const source=[
      "function hidden(){return 'callbackSourceLiteral';}",
      "function safe(){return 'unrelatedLiteral';}",
      'queueMicrotask(hidden);',
      'module.exports={value:safe(),safe};'
    ].join('\n');
    const native=observe(source);
    assert.equal(native.value,'unrelatedLiteral');
    assert.equal(native.hiddenSource,"function hidden(){return 'callbackSourceLiteral';}");
    assert.equal(native.safeSource,"function safe(){return 'unrelatedLiteral';}");
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-host-held-precision-string-'+mode,
      identifiers:false,strings:true,properties:false
    }).files[0];
    const transformed=observe(String(output.code));
    assert.notEqual(transformed.hiddenSource,native.hiddenSource,
      'current behavior: observed callback source is changed');
    assert.notEqual(transformed.safeSource,native.safeSource,
      'current behavior: unrelated function source is also changed');
    assert.equal(transformed.value,native.value);
    assert.equal(transformed.invoked,false);
    console.log('AGENT9_HOST_HELD_PRECISION_STRING '+JSON.stringify({
      mode,literals:output.metrics.literals,
      hiddenSourceEqual:transformed.hiddenSource===native.hiddenSource,
      safeSourceChanged:transformed.safeSource!==native.safeSource,
      nativeHidden:native.hiddenSource,emittedHidden:transformed.hiddenSource,
      nativeSafe:native.safeSource,emittedSafe:transformed.safeSource
    }));
  });
}
