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

test('a bare local FunctionExpression does not inherit its enclosing getter receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){return this.callback;};function invoke(callback){return callback();}return invoke(read);}};'+
    'external(owner.result);';
  assert.equal(execute(source),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a bare named FunctionExpression does not inherit its enclosing getter receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function read(){return this.callback;};function invoke(callback){return callback();}return invoke(read);}};'+
    'external(owner.result);';
  assert.equal(execute(source),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('an arrow nested in a bare FunctionExpression keeps that function dynamic this',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){const nested=()=>this.callback;return nested();};function invoke(callback){return callback();}return invoke(read);}};'+
    'external(owner.result);';
  assert.equal(execute(source),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a FunctionExpression invoked as an object method receives the object receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,read:function(){return this.callback;}};'+
    'external(owner.read());';
  const captured=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a FunctionExpression explicitly called with the getter receiver exposes its callback',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){return this.callback;};return read.call(this);}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});
