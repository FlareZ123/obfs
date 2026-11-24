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

const handoffs=[
  {name:'direct',code:'queueMicrotask(hidden);'},
  {name:'alias',code:'const callback=hidden;queueMicrotask(callback);'},
  {name:'object-field',code:'const holder={callback:hidden};queueMicrotask(holder.callback);'},
  {name:'parameter-forward',code:'function forward(fn){queueMicrotask(fn);}forward(hidden);'},
  {name:'returned-callback',code:'function getCallback(){return hidden;}queueMicrotask(getCallback());'}
];

for(const mode of /** @type {const} */ (['coo','sno'])){
  for(const handoff of handoffs){
    test(mode+' red control: identifier rewrite leaks host-held callback source via '+handoff.name,()=>{
      const source=[
        'const owner={secretField:41};',
        'function hidden(inputValue){return owner.secretField+inputValue;}',
        handoff.code,
        'module.exports=0;'
      ].join('\n');
      const native=observe(source);
      assert.equal(native.source,'function hidden(inputValue){return owner.secretField+inputValue;}');
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-host-held-identifier-flow-'+mode+'-'+handoff.name,
        identifiers:true,strings:false,properties:false
      }).files[0];
      const transformed=observe(String(output.code));
      assert.ok(output.metrics.bindings>=1);
      assert.notEqual(transformed.source,native.source,
        mode+'/'+handoff.name+': host-held callback source was changed');
      assert.equal(transformed.value,native.value);
      assert.equal(transformed.invoked,false);
      console.log('AGENT9_HOST_HELD_IDENTIFIER_FLOW '+JSON.stringify({
        mode,variant:handoff.name,bindings:output.metrics.bindings,
        native:native.source,emitted:transformed.source
      }));
    });

    test(mode+' red control: string rewrite leaks host-held callback source via '+handoff.name,()=>{
      const source=[
        "function hidden(){return 'callbackSourceLiteral';}",
        handoff.code,
        "module.exports='unrelatedLiteral'.length;"
      ].join('\n');
      const native=observe(source);
      assert.equal(native.source,"function hidden(){return 'callbackSourceLiteral';}");
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-host-held-string-flow-'+mode+'-'+handoff.name,
        identifiers:false,strings:true,properties:false
      }).files[0];
      const transformed=observe(String(output.code));
      assert.ok(output.metrics.literals>=1);
      assert.notEqual(transformed.source,native.source,
        mode+'/'+handoff.name+': host-held callback source was changed');
      assert.equal(transformed.value,native.value);
      assert.equal(transformed.invoked,false);
      console.log('AGENT9_HOST_HELD_STRING_FLOW '+JSON.stringify({
        mode,variant:handoff.name,literals:output.metrics.literals,
        native:native.source,emitted:transformed.source
      }));
    });
  }
}
