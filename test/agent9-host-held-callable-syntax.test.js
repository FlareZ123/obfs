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

const syntax=[
  {
    name:'function-declaration',
    identifiers:'function hidden(inputValue){return inputValue+1;}',
    strings:"function hidden(){return 'callbackSourceLiteral';}"
  },
  {
    name:'function-expression',
    identifiers:'const hidden=function(inputValue){return inputValue+1;};',
    strings:"const hidden=function(){return 'callbackSourceLiteral';};"
  },
  {
    name:'arrow-function',
    identifiers:'const hidden=(inputValue)=>inputValue+1;',
    strings:"const hidden=()=> 'callbackSourceLiteral';"
  },
  {
    name:'object-method',
    identifiers:'const holder={hidden(inputValue){return inputValue+1;}};const hidden=holder.hidden;',
    strings:"const holder={hidden(){return 'callbackSourceLiteral';}};const hidden=holder.hidden;"
  },
  {
    name:'class-method',
    identifiers:'class Box{hidden(inputValue){return inputValue+1;}}const hidden=new Box().hidden;',
    strings:"class Box{hidden(){return 'callbackSourceLiteral';}}const hidden=new Box().hidden;"
  },
  {
    name:'async-function',
    identifiers:'async function hidden(inputValue){return inputValue+1;}',
    strings:"async function hidden(){return 'callbackSourceLiteral';}"
  },
  {
    name:'generator-function',
    identifiers:'function* hidden(inputValue){yield inputValue;}',
    strings:"function* hidden(){yield 'callbackSourceLiteral';}"
  }
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  for(const item of syntax){
    test(mode+' red control: identifier transform changes host-held '+item.name+' source',()=>{
      const source=[item.identifiers,'queueMicrotask(hidden);','module.exports=0;'].join('\n');
      const native=observe(source);
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-host-held-syntax-identifier-'+mode+'-'+item.name,
        identifiers:true,strings:false,properties:false
      }).files[0];
      const transformed=observe(String(output.code));
      assert.ok(output.metrics.bindings>=1);
      assert.notEqual(transformed.source,native.source);
      assert.equal(transformed.value,native.value);
      assert.equal(transformed.invoked,false);
      console.log('AGENT9_HOST_HELD_SYNTAX_IDENTIFIER '+JSON.stringify({
        mode,syntax:item.name,bindings:output.metrics.bindings,
        native:native.source,emitted:transformed.source
      }));
    });

    test(mode+' red control: string transform changes host-held '+item.name+' source',()=>{
      const source=[item.strings,'queueMicrotask(hidden);',"module.exports='unrelatedLiteral'.length;"].join('\n');
      const native=observe(source);
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-host-held-syntax-string-'+mode+'-'+item.name,
        identifiers:false,strings:true,properties:false
      }).files[0];
      const transformed=observe(String(output.code));
      assert.ok(output.metrics.literals>=1);
      assert.notEqual(transformed.source,native.source);
      assert.equal(transformed.value,native.value);
      assert.equal(transformed.invoked,false);
      console.log('AGENT9_HOST_HELD_SYNTAX_STRING '+JSON.stringify({
        mode,syntax:item.name,literals:output.metrics.literals,
        native:native.source,emitted:transformed.source
      }));
    });
  }
}
