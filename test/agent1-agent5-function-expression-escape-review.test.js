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

test('a host-held ordinary FunctionExpression does not capture the enclosing getter receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){return this.callback;};external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.call({}),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a host-held ordinary FunctionExpression with a nested arrow keeps dynamic this',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){const nested=()=>this.callback;return nested();};external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.call({}),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a returned object method FunctionExpression uses the returned object rather than the outer getter receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return {read:function(){return this.callback;}};}};'+
    'external(owner.result);';
  const captured=execute(source);
  assert.equal(captured?.read?.call({}),undefined);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a returned FunctionExpression invoked as the original getter property uses that call receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return function(){return this.callback;};}};'+
    'external(owner.result());';
  const captured=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});
