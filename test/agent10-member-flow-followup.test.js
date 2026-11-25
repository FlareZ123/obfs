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

test('an unknown local function constructor remains conservatively held when its instance member escapes',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function Local(){this.callback=hidden;}'+
    'function entry(){owner=new Local();external(owner.callback);}'+
    'entry();';
  const constructor=named(analyze(source),'Local')[0];
  assert.ok(constructor,'the constructor must have an analysis summary');
  assert.equal(constructor.hostHeldCallable,true,
    'without a class-instance proof, retain the local constructor callable');
});

test('a namespace-qualified function constructor remains conservatively held',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function Local(){this.callback=hidden;}'+
    'const namespace={Local};'+
    'function entry(){owner=new namespace.Local();external(owner.callback);}'+
    'entry();';
  const constructor=named(analyze(source),'Local')[0];
  assert.ok(constructor,'the constructor must have an analysis summary');
  assert.equal(constructor.hostHeldCallable,true,
    'a namespace-qualified unknown constructor must retain the callable fallback');
});

test('a callable returned from a class getter remains held by the generic return sink',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{get callback(){return hidden;}}'+
    'function entry(){owner=new Local();external(owner.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a getter return value is the value observed by the host');
});

test('a callable returned from an inherited getter remains held by the generic return sink',()=>{
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

test('a dynamic key after a nested mutable factory alias cannot hide a field callable',()=>{
  const source=
    'let holder;let key;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>({nested:new Local()});'+
    'function leak(){external(holder.nested[key]);}'+
    'function entry(){holder=create();key="callback";leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamic key on a nested member receiver must retain all callables in the known receiver');
});

test('a dynamic key after a nested factory-call member cannot hide a field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>({nested:new Local()});'+
    'function entry(){external(create().nested[key]);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamic key on a factory-call result must retain all callables in the known nested receiver');
});

test('an object-literal primitive getter does not retain an unrelated callable sibling',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get value(){return 1;}};'+
    'function entry(){external(owner.value);}'+
    'entry();';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,false,
    'the getter returns a primitive, so the unrelated callback property is not observed');
  assert.equal(hidden.safe,true);
});


test('a mutable local factory binding cannot hide a returned class-field callable',()=>{
  const source=
    'let owner;let create;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'create=()=>new Local();'+
    'function leak(){external(owner.callback);}'+
    'function entry(){owner=create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'callable return analysis must resolve a locally assigned mutable factory binding');
});


test('a mutable factory binding assigned a local function declaration cannot hide its return',()=>{
  const source=
    'let owner;let create;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function make(){return new Local();}'+
    'create=make;'+
    'function leak(){external(owner.callback);}'+
    'function entry(){owner=create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'mutable aliases to local function declarations must participate in factory return analysis');
});

test('recursive mutable factory returns terminate while retaining known branch values',()=>{
  const source=
    'let owner;let create;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'create=()=>flag?new Local():create();'+
    'function leak(){external(owner.callback);}'+
    'function entry(){owner=create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'recursive factory return graphs must terminate without dropping known callable branches');
});


test('an expression-bodied factory passed to a host cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'external(create);';
  assertHeld(hiddenSummary(source),
    'an unknown host can invoke the escaping factory and inspect its returned instance field');
});


test('an exported expression-bodied factory cannot hide its returned class-field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'module.exports=create;';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.safe,false,
    'an external module can invoke the exported factory and inspect the returned instance field');
  assert.ok(hidden.hostHeldCallable||hidden.externallyReachable,
    'the returned callable must inherit an external observation/escape effect');
});


test('an exported ESM expression-bodied factory cannot hide its returned class-field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'export const create=()=>new Local();';
  const result=summarizeAmbientCallEffects(parse(source,'module'),'module');
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden,'the hidden function must have an analysis summary');
  assert.equal(hidden.safe,false,
    'an ESM importer can invoke the exported concise factory and inspect the returned field');
  assert.equal(hidden.hostHeldCallable,true,
    'the returned class-field callable must be marked held across the ESM export boundary');
});


test('a classic-script global expression-bodied factory cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'var create=()=>new Local();';
  const result=summarizeAmbientCallEffects(parse(source,'script'),'script');
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden,'the hidden function must have an analysis summary');
  assert.equal(hidden.safe,false,
    'a classic-script global factory can be invoked by the host and expose its returned field');
  assert.equal(hidden.hostHeldCallable,true,
    'callable values returned by global script functions must be held');
});

test('a host-global expression-bodied factory cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'globalThis.create=()=>new Local();';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.safe,false,
    'a host-global factory can be invoked externally and expose its returned field');
  assert.equal(hidden.hostHeldCallable,true,
    'callable values returned by host-global exports must be held');
});
