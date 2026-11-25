'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source @returns {Function[]} */
function execute(source) {
  /** @type {Function[]} */
  const captured=[];
  vm.runInNewContext(source,{external(value){captured.push(value);}});
  return captured;
}

/** @param {string} source @returns {ReturnType<typeof analyze>['summaries'][number]} */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('a later object spread cannot hide the callable that overrides an explicit property',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const later={callback:hidden};'+
    'const owner={callback:harmless,...later};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the runtime spread order must deliver the hidden function to the host');
  assert.match(String(captured),/state\.secret/,
    'the host must be able to observe the original private property spelling');
  assert.equal(summary.hostHeldCallable,true,
    'the final callback comes from the later spread, so the host can observe hidden source');
  assert.equal(summary.safe,false,
    'a callable overwritten by a later spread must not be classified safe');
});

test('an explicit property after a spread shadows the earlier callable without over-retaining it',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const earlier={callback:hidden};'+
    'const owner={...earlier,callback:harmless};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'harmless',
    'the later explicit property must be the actual runtime value');
  assert.equal(summary.hostHeldCallable,false,
    'the later explicit property wins over the earlier spread');
  assert.equal(summary.safe,true,
    'the overwritten callable is not reachable through the observed property');
});

test('an array spread before a static index cannot hide a shifted callable',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const later=[harmless,hidden];'+
    'const owner=[...later,harmless];'+
    'external(owner[1]);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the earlier array spread shifts hidden into static index 1');
  assert.match(String(captured),/state\.secret/);
  assert.equal(summary.hostHeldCallable,true,
    'the resolver must account for array-spread length before trusting a static index');
  assert.equal(summary.safe,false);
});

test('a later spread getter cannot hide the callable value it returns',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const later={get callback(){return hidden;}};'+
    'const owner={callback:harmless,...later};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'object spread invokes the getter and copies its returned callable');
  assert.match(String(captured),/state\.secret/,
    'the copied callable retains its original source spelling');
  assert.equal(summary.hostHeldCallable,true,
    'the held getter closure must also retain the callable it returns');
  assert.equal(summary.safe,false);
});

test('a spread-only property still resolves its callable value',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const later={callback:hidden};'+
    'const owner={...later};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the spread-only property must be the actual runtime value');
  assert.equal(summary.hostHeldCallable,true,
    'the spread supplies the observed callback property');
  assert.equal(summary.safe,false);
});
