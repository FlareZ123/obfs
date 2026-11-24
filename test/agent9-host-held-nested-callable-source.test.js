'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @returns {{value:unknown,source:string|null,invoked:boolean}}
 */
function observe(source){
  const seen={source:null,invoked:false};
  const context={
    module:{exports:null},
    queueMicrotask(callback){
      seen.source=Function.prototype.toString.call(callback);
    }
  };
  vm.runInNewContext(source,context,{timeout:2500});
  return {value:context.module.exports,...seen};
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  test(mode+' nested source closure: identifier mutation inside nested function changes outer host-held source',()=>{
    const source=[
      'function outer(inputValue){',
      '  function inner(hiddenValue){return hiddenValue+inputValue;}',
      '  return inner(inputValue);',
      '}',
      'queueMicrotask(outer);',
      'module.exports=0;'
    ].join('\n');
    const native=observe(source);
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-nested-host-held-identifier-'+mode,
      identifiers:true,strings:false,properties:false
    });
    const emitted=observe(String(compiled.files[0].code));
    assert.notEqual(emitted.source,native.source);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.invoked,false);
    console.log('AGENT9_NESTED_HOST_HELD_IDENTIFIER '+JSON.stringify({
      mode,native:native.source,emitted:emitted.source
    }));
  });

  test(mode+' nested source closure: preserve nested literal in outer host-held source while encoding unrelated top-level string',()=>{
    const source=[
      'function outer(inputValue){',
      "  function inner(hiddenValue){return 'nestedLiteral'+hiddenValue;}",
      '  return inner(inputValue);',
      '}',
      'queueMicrotask(outer);',
      "module.exports='unrelatedLiteral'.length;"
    ].join('\\n');
    const native=observe(source);
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-nested-host-held-string-'+mode,
      identifiers:false,strings:true,properties:false
    });
    const emitted=observe(String(compiled.files[0].code));
    assert.equal(emitted.source,native.source);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.invoked,false);
    assert.ok(compiled.files[0].metrics.literals>=1);
    console.log('AGENT9_NESTED_HOST_HELD_STRING '+JSON.stringify({
      mode,literals:compiled.files[0].metrics.literals,
      native:native.source,emitted:emitted.source,sourceEqual:emitted.source===native.source
    }));
  });
    const emitted=observe(String(compiled.files[0].code));
    assert.notEqual(emitted.source,native.source);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.invoked,false);
    console.log('AGENT9_NESTED_HOST_HELD_STRING '+JSON.stringify({
      mode,native:native.source,emitted:emitted.source
    }));
  });
}
