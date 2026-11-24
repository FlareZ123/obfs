'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @returns {{value:unknown,name:string,length:number,source:string|null,invoked:boolean}}
 */
function observe(source){
  const seen={name:'',length:0,source:null,invoked:false};
  const context={
    module:{exports:null},
    queueMicrotask(callback){
      seen.name=callback.name;
      seen.length=callback.length;
      seen.source=Function.prototype.toString.call(callback);
    }
  };
  vm.runInNewContext(source,context,{timeout:2500});
  return {value:context.module.exports,...seen};
}

const source=[
  'const holder={',
  'callback(inputValue){return inputValue+1;},',
  'unrelatedField:41',
  '};',
  'queueMicrotask(holder.callback);',
  'module.exports=holder.unrelatedField;'
].join('\n');

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  test(mode+' host-held object method preserves source/name/length while retaining owner semantics',()=>{
    const native=observe(source);
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'agent9-host-held-owner-field-'+mode,
      identifiers:false,strings:false,properties:true
    });
    const emitted=observe(String(compiled.files[0].code));
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.name,native.name);
    assert.equal(emitted.length,native.length);
    assert.equal(emitted.source,native.source);
    assert.equal(emitted.invoked,false);
    console.log('AGENT9_HOST_HELD_OWNER_FIELD '+JSON.stringify({
      mode,properties:compiled.files[0].metrics.properties,
      sourceEqual:emitted.source===native.source,
      ownerFieldStillNative:String(compiled.files[0].code).includes('unrelatedField'),
      name:emitted.name,length:emitted.length
    }));
  });
}
