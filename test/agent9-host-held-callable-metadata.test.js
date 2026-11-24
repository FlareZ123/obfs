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
  const observed={name:'',length:0,source:null,invoked:false};
  /** @type {{module:{exports:unknown},queueMicrotask:(callback:Function)=>void}} */
  const context={
    module:{exports:null},
    queueMicrotask(callback){
      observed.name=callback.name;
      observed.length=callback.length;
      observed.source=Function.prototype.toString.call(callback);
    }
  };
  vm.runInNewContext(source,context,{timeout:2500});
  return {value:context.module.exports,...observed};
}

const fixtures=[
  {
    name:'object-method',
    source:[
      'const holder={',
      'callback(inputValue){return inputValue+1;},',
      'unrelatedField:41',
      '};',
      'queueMicrotask(holder.callback);',
      'module.exports=holder.unrelatedField;'
    ].join('\n')
  },
  {
    name:'class-method',
    source:[
      'class Box{',
      'callback(inputValue){return inputValue+1;}',
      '}',
      'const box=new Box();',
      'const owner={unrelatedField:41};',
      'queueMicrotask(box.callback);',
      'module.exports=owner.unrelatedField;'
    ].join('\n')
  }
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  for(const fixture of fixtures){
    test(mode+' property metadata positive: preserve host-held '+fixture.name+' source/name/length and transform unrelated key',()=>{
      const native=observe(fixture.source);
      assert.equal(native.value,41);
      assert.equal(native.name,'callback');
      assert.equal(native.length,1);
      const compiled=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:fixture.source
      }],{
        mode,seed:'agent9-host-held-metadata-'+mode+'-'+fixture.name,
        identifiers:false,strings:false,properties:true
      });
      const emitted=observe(String(compiled.files[0].code));
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.name,native.name);
      assert.equal(emitted.length,native.length);
      assert.equal(emitted.source,native.source);
      assert.equal(emitted.invoked,false);
      assert.ok(compiled.files[0].metrics.properties>=1);
      console.log('AGENT9_HOST_HELD_METADATA '+JSON.stringify({
        mode,fixture:fixture.name,properties:compiled.files[0].metrics.properties,
        name:emitted.name,length:emitted.length,sourceEqual:emitted.source===native.source,
        nativeSource:native.source,emittedSource:emitted.source
      }));
    });
  }
}
