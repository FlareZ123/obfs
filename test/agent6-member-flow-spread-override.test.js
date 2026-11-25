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
  vm.runInNewContext(source,{
    external(value){captured.push(value);},
    readKey(){return 'callback';}
  });
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

test('an array spread after a fixed index does not affect that index',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const later=[hidden];'+
    'const owner=[harmless,...later];'+
    'external(owner[0]);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'harmless',
    'the fixed element before the spread remains at runtime index zero');
  assert.equal(summary.hostHeldCallable,false,
    'a later spread cannot overwrite an earlier array index');
  assert.equal(summary.safe,true);
});

test('an unknown computed key after an explicit property cannot hide an overwrite',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const key=readKey();'+
    'const owner={callback:harmless,[key]:hidden};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the host-provided computed key overwrites callback at runtime');
  assert.match(String(captured),/state\.secret/);
  assert.equal(summary.hostHeldCallable,true,
    'an unknown later computed key may alias the statically requested key');
  assert.equal(summary.safe,false);
});

test('an unknown computed key alone can supply the observed property',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const key=readKey();'+
    'const owner={[key]:hidden};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(summary.hostHeldCallable,true,
    'a dynamic computed key may produce the statically read property');
  assert.equal(summary.safe,false);
});

test('an unknown computed key before an explicit property is shadowed',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const key=readKey();'+
    'const owner={[key]:hidden,callback:harmless};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'harmless',
    'the later explicit property wins over the earlier computed property');
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('an unknown array member call can return a host-held callable',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner=[hidden];'+
    'external(owner.at(0));';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'Array.prototype.at returns the local function stored in the receiver');
  assert.match(String(captured),/state\.secret/);
  assert.equal(summary.hostHeldCallable,true,
    'an unresolved member call may return a callable from its receiver');
  assert.equal(summary.safe,false);
});

test('an array mutator return can expose a host-held callable',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner=[hidden];'+
    'external(owner.pop());';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'Array.prototype.pop returns the local function removed from the receiver');
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});

test('a local member call with an unresolved this-return retains receiver callables',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner={callback:hidden,get(){return this.callback;}};'+
    'external(owner.get());';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the local method returns the callback stored on its receiver');
  assert.equal(summary.hostHeldCallable,true,
    'an unresolved this-member return must conservatively retain receiver callables');
  assert.equal(summary.safe,false);
});

test('a known primitive-returning local member call does not retain unrelated callables',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const owner={callback:hidden,getIndex(){return 0;}};'+
    'external(owner.getIndex());';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured,undefined,
    'the host receives the primitive return, not the stored callback');
  assert.equal(summary.hostHeldCallable,false,
    'a proven primitive return does not require receiver fallback');
  assert.equal(summary.safe,true);
});

test('an object-literal prototype setter can supply the observed callable',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'const prototype={callback:hidden};'+
    'const owner={__proto__:prototype};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden',
    'the object inherits callback from its explicit prototype');
  assert.match(String(captured),/state\.secret/);
  assert.equal(summary.hostHeldCallable,true,
    'the prototype-provided callable is reachable through the member read');
  assert.equal(summary.safe,false);
});

test('an own property shadows a callable inherited through the prototype setter',()=>{
  const source=
    'function hidden(){const state={secret:7};return state.secret;}'+
    'function harmless(){return 0;}'+
    'const prototype={callback:hidden};'+
    'const owner={__proto__:prototype,callback:harmless};'+
    'external(owner.callback);';
  const summary=hiddenSummary(source);
  const [captured]=execute(source);
  assert.equal(captured?.name,'harmless',
    'the own data property shadows the inherited callback');
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
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
