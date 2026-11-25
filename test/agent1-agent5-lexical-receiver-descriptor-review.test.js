'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source */
function execute(source) {
  /** @type {unknown} */
  let captured;
  const context={module:{exports:null},external(value){captured=value;}};
  vm.runInNewContext(source,context);
  if(typeof context.module.exports==='function')context.module.exports();
  return captured;
}

/** @param {string} source */
function hiddenSummary(source) {
  const result=analyze(source);
  const summary=result.summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden callback must have an analysis summary');
  return summary;
}

test('a descriptor-defined accessor exposes a callback captured through a lexical arrow',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=()=>this.callback;const target={};Object.defineProperty(target,"exposed",{get(){return read();}});return target;}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.exposed?.name,'hidden');
  assert.match(String(captured?.exposed),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a descriptor-defined accessor returning a primitive keeps callable siblings precise',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>this.count;const target={};Object.defineProperty(target,"exposed",{get(){return read();}});return target;}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.exposed,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('a Proxy get trap exposes a callback captured through a lexical arrow',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=()=>this.callback;const target={};return new Proxy(target,{get(object,key,receiver){if(key==="exposed")return read();return Reflect.get(object,key,receiver);}});}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.exposed?.name,'hidden');
  assert.match(String(captured?.exposed),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a Proxy get trap returning a primitive keeps callable siblings precise',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>this.count;const target={};return new Proxy(target,{get(object,key,receiver){if(key==="exposed")return read();return Reflect.get(object,key,receiver);}});}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.exposed,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});
