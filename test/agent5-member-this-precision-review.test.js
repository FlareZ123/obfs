'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

test('a local method returning a primitive this-field does not retain callable siblings',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner={callback:hidden,count:1,getCount(){return this.count;}};'+
    'function entry(){external(owner.getCount());}'+
    'module.exports=entry;';
  const summary=named(analyze(source),'hidden')[0];
  assert.ok(summary,'the hidden function must have an analysis summary');
  assert.equal(summary.hostHeldCallable,false,
    'the host receives the primitive count, not the unrelated callback');
  assert.equal(summary.safe,true);
});

test('a local method returning its callback field still retains the callable',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner={callback:hidden,getCallback(){return this.callback;}};'+
    'function entry(){external(owner.getCallback());}'+
    'module.exports=entry;';
  const summary=named(analyze(source),'hidden')[0];
  assert.ok(summary,'the hidden function must have an analysis summary');
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});
