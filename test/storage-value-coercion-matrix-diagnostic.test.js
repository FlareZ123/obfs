'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {fixtures}=require('./storage-value-coercion-fixtures');

/** @type {Record<string,string>} */
const variants={
  minimal:'function inspect(){};',
  ownToString:'function inspect(){};inspect.toString=function(){return "stable";};',
  ownToStringArrow:'function inspect(){};inspect.toString=()=>"stable";',
  callValue:'function inspect(){};localStorage.setItem("key",inspect);',
  callKey:'function inspect(){};localStorage.setItem(inspect,"value");',
  ownToStringCallValue:'function inspect(){};inspect.toString=function(){return "stable";};localStorage.setItem("key",inspect);',
  ownToStringCallKey:'function inspect(){};inspect.toString=function(){return "stable";};localStorage.setItem(inspect,"value");',
  ownToStringThisCheck:'function inspect(){};inspect.toString=function(){if(this!==inspect)throw new Error("wrong");return "stable";};localStorage.setItem(inspect,"value");',
  ownToStringCounter:'function inspect(){};let calls=0;inspect.toString=function(){calls++;return "stable";};localStorage.setItem(inspect,"value");',
  ownSymbolToPrimitive:'function inspect(){};inspect[Symbol.toPrimitive]=function(hint){return "stable";};localStorage.setItem("key",inspect);',
  ownSymbolWithHint:'function inspect(){};let hint="";inspect[Symbol.toPrimitive]=function(value){hint=value;return "stable";};localStorage.setItem("key",inspect);',
  directBypass:'function inspect(){};inspect.toString=function(){return "stable";};const source=Function.prototype.toString.call(inspect);localStorage.setItem("key",source);',
  hookDelegates:'function inspect(){};inspect.toString=function(){return Function.prototype.toString.call(this);};localStorage.setItem("key",inspect);',
  fullOwnToString:fixtures.ownToString,
  fullOwnSymbol:fixtures.ownSymbolToPrimitive
};

test('emit Storage hook classification matrix (intentional diagnostic failure)',()=>{
  const matrix=Object.entries(variants).map(([name,source])=>{
    const observed=observesFunctionSource(parse(source,'module'));
    const result=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{
      mode:'coo',seed:'storage-hook-matrix/'+name,
      properties:false,identifiers:true,strings:false
    });
    const file=result.files[0];
    return {
      name,observed,
      bindings:file?.metrics.bindings??null,
      retainsPrivateLocal:String(file?.code??'').includes('privateLocal'),
      retainsIndependentLocal:String(file?.code??'').includes('independentLocal')
    };
  });
  assert.fail('DIAGNOSTIC_ONLY_STORAGE_HOOK_MATRIX '+JSON.stringify(matrix));
});
