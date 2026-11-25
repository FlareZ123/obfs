'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source @returns {ReturnType<typeof analyze>['summaries'][number]} */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('a later object spread cannot hide the callable that overrides an explicit property',()=>{
  const source=
    'const state={secret:7};'+
    'function hidden(){return state.secret;}'+
    'function harmless(){return 0;}'+
    'const later={callback:hidden};'+
    'const owner={callback:harmless,...later};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,
    'the final callback comes from the later spread, so the host can observe hidden source');
  assert.equal(summary.safe,false,
    'a callable overwritten by a later spread must not be classified safe');
});

test('an explicit property after a spread shadows the earlier callable without over-retaining it',()=>{
  const source=
    'const state={secret:7};'+
    'function hidden(){return state.secret;}'+
    'function harmless(){return 0;}'+
    'const earlier={callback:hidden};'+
    'const owner={...earlier,callback:harmless};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false,
    'the later explicit property wins over the earlier spread');
  assert.equal(summary.safe,true,
    'the overwritten callable is not reachable through the observed property');
});

test('a spread-only property still resolves its callable value',()=>{
  const source=
    'const state={secret:7};'+
    'function hidden(){return state.secret;}'+
    'const later={callback:hidden};'+
    'const owner={...later};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,
    'the spread supplies the observed callback property');
  assert.equal(summary.safe,false);
});
