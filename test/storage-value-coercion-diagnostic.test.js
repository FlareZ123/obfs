'use strict';

const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');

/** @type {Record<string,string>} */
const cases={
  minimal:'function inspect(){};',
  ownToString:'function inspect(){};inspect.toString=function(){return "stable";};',
  ownToStringArrow:'function inspect(){};inspect.toString=()=>"stable";',
  ownToStringCallValue:'function inspect(){};inspect.toString=function(){return "stable";};localStorage.setItem("key",inspect);',
  ownToStringCallKey:'function inspect(){};inspect.toString=function(){return "stable";};localStorage.setItem(inspect,"value");',
  callValue:'function inspect(){};localStorage.setItem("key",inspect);',
  callKey:'function inspect(){};localStorage.setItem(inspect,"value");',
  ownToStringThisCheck:'function inspect(){};inspect.toString=function(){if(this!==inspect)throw new Error("wrong");return "stable";};localStorage.setItem(inspect,"value");',
  ownToStringCounter:'function inspect(){};let calls=0;inspect.toString=function(){calls++;return "stable";};localStorage.setItem(inspect,"value");',
  ownSymbolToPrimitive:'function inspect(){};inspect[Symbol.toPrimitive]=function(hint){return "stable";};localStorage.setItem("key",inspect);',
  ownSymbolWithHint:'function inspect(){};let hint="";inspect[Symbol.toPrimitive]=function(value){hint=value;return "stable";};localStorage.setItem("key",inspect);',
  directBypass:'function inspect(){};inspect.toString=function(){return "stable";};const source=Function.prototype.toString.call(inspect);localStorage.setItem("key",source);',
  hookDelegates:'function inspect(){};inspect.toString=function(){return Function.prototype.toString.call(this);};localStorage.setItem("key",inspect);'
};

/** @type {Array<string>} */
const names=Object.keys(cases);
for(const name of names) {
  test('diagnose source-observer classification: '+name,()=>{
    const observed=observesFunctionSource(parse(cases[name],'module'));
    console.log('STORAGE_HOOK_DIAGNOSTIC',JSON.stringify({name,observed}));
  });
}
