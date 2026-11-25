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

/** @param {string} source @returns {ReturnType<typeof analyze>['summaries'][number]} */
function hiddenSummary(source) {
  const summary=named(analyze(source),'hidden')[0];
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('an object-literal getter returning this.callback holds the callback callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this.callback;}};'+
    'function entry(){external(owner.result);}'+
    'module.exports=entry;';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,
    'the getter result is the callable field read through the actual receiver');
  assert.equal(summary.safe,false);
});

test('an object-literal method returning this.callback holds the callback callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,getCallback(){return this.callback;}};'+
    'function entry(){external(owner.getCallback());}'+
    'module.exports=entry;';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,
    'the method result is the callable field read through the actual receiver');
  assert.equal(summary.safe,false);
});

test('a direct object-literal callback read remains the positive control',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden};'+
    'function entry(){external(owner.callback);}'+
    'module.exports=entry;';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});
