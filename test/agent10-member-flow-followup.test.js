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

/** @param {ReturnType<typeof hiddenSummary>} summary @param {string} context */
function assertHeld(summary,context) {
  assert.equal(summary.hostHeldCallable,true,context);
  assert.equal(summary.safe,false,context);
}

test('static member read through an async local factory is the paired positive control',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner.callback);}'+
    'class Local{callback=hidden;}'+
    'const factory={create:async()=>new Local()};'+
    'async function entry(){owner=await factory.create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'the static member resolver should follow an async expression-bodied factory result');
});

test('a dynamic member key through an async local factory cannot hide the callable',()=>{
  const source=
    'let owner;let key;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner[key]);}'+
    'class Local{callback=hidden;}'+
    'const factory={create:async()=>new Local()};'+
    'async function entry(){owner=await factory.create();key="callback";leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamic key selecting the callable field must follow the same known receiver values');
});

test('destructuring a callable field from an expression-bodied factory result cannot hide it',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'function entry(){const {callback}=create();external(callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'the destructuring sink must resolve the known expression-bodied factory return');
});

test('a nested member chain after an expression-bodied factory return cannot hide the callable',()=>{
  const source=
    'let holder;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>({nested:{current:new Local()}});'+
    'function leak(){external(holder.nested.current.callback);}'+
    'function entry(){holder=create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'nested member reads must compose mutable receiver values with factory-return values');
});

test('a statically named namespace constructor preserves its instance field callable',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const namespace={Local};'+
    'function leak(){external(owner.callback);}'+
    'function entry(){owner=new namespace.Local();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a statically resolved namespace constructor must preserve its known class field');
});

test('a getter returning a callable field value cannot be treated as an empty property',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{get callback(){return hidden;}}'+
    'function entry(){owner=new Local();external(owner.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a getter return value is the value observed by the host');
});

test('an inherited getter returning a callable remains visible through the subclass',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Base{get callback(){return hidden;}}'+
    'class Local extends Base{}'+
    'function entry(){owner=new Local();external(owner.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'the property-value resolver must include callable values returned by inherited getters');
});

test('a primitive getter does not retain an unrelated callable sibling field',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;get value(){return 1;}}'+
    'function entry(){owner=new Local();external(owner.value);}'+
    'module.exports=entry;';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,false,
    'a getter returning a primitive must not retain an unrelated callable field');
  assert.equal(hidden.safe,true);
});
