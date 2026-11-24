'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
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

const paths=[
  {name:'direct',handoff:'queueMicrotask(hidden);'},
  {name:'alias',handoff:'const callback=hidden;queueMicrotask(callback);'},
  {name:'object-field',handoff:'const holder={callback:hidden};queueMicrotask(holder.callback);'},
  {name:'parameter-forward',handoff:'function forward(fn){queueMicrotask(fn);}forward(hidden);'},
  {name:'returned-callback',handoff:'function getCallback(){return hidden;}queueMicrotask(getCallback());'}
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  for(const path of paths){
    test(mode+' host-held callable property-flow diagnostic: '+path.name,()=>{
      const source=[
        'const owner={secretField:41};',
        'const other={unrelatedField:7};',
        'function hidden(){return owner.secretField;}',
        'function plain(){return other.unrelatedField;}',
        path.handoff,
        'module.exports=plain();'
      ].join('\n');
      const native=observe(source);
      assert.equal(native.value,7);
      assert.equal(native.invoked,false);
      assert.equal(native.source,'function hidden(){return owner.secretField;}');
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,closedWorld:true,seed:'agent9-host-held-property-flow-'+mode+'-'+path.name,
        identifiers:false,strings:false,properties:true
      }).files[0];
      const transformed=observe(String(output.code));
      assert.equal(transformed.value,native.value,
        mode+'/'+path.name+': runtime result changed');
      assert.equal(transformed.invoked,false);
      console.log('AGENT9_HOST_HELD_PROPERTY_FLOW '+JSON.stringify({
        mode,variant:path.name,properties:output.metrics.properties,
        sourceEqual:transformed.source===native.source,
        native:native.source,emitted:transformed.source,
        secretKeyStillPresent:String(output.code).includes('secretField'),
        unrelatedKeyStillPresent:String(output.code).includes('unrelatedField')
      }));
    });
  }
}
