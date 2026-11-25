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

test('Reflect.get on a local class instance cannot hide a callable field',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){owner=new Local();external(Reflect.get(owner,"callback"));}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'Reflect.get is a reflective member read and must not make the callable appear safe');
});

test('Reflect.get with a dynamic key on a local class instance remains fail-closed',()=>{
  const source=
    'let owner;let key;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){owner=new Local();key="callback";external(Reflect.get(owner,key));}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamic reflective key must conservatively retain the known receiver callables');
});

test('Object.getOwnPropertyDescriptor cannot hide a callable field value',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){owner=new Local();external(Object.getOwnPropertyDescriptor(owner,"callback").value);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'property-descriptor reflection must conservatively retain the callable field');
});

test('direct eval cannot hide a callable member read from a local instance',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){owner=new Local();eval("external(owner.callback)");}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'direct eval can inspect the local lexical environment and must fail closed');
});

test('a Function-constructor reader cannot hide a callable passed as its receiver',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const read=new Function("value","return value.callback;");'+
    'function entry(){owner=new Local();external(read(owner));}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamically generated reader is an unknown call boundary for the receiver value');
});

test('a callable field behind an unknown Proxy constructor is conservatively held',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){'+
      'owner=new Proxy(new Local(),{get(target,key,receiver){return Reflect.get(target,key,receiver);}});'+
      'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an unknown constructor may wrap the receiver and must not erase callable arguments');
});

test('optional chaining through a nested factory alias preserves the callable value',()=>{
  const source=
    'let holder;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>({nested:{current:new Local()}});'+
    'function entry(){holder=create();external(holder?.nested?.current?.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'optional chaining must compose the same known nested member values as ordinary member reads');
});

test('an optional dynamic key on a nested receiver remains fail-closed',()=>{
  const source=
    'let holder;let key;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>({nested:{current:new Local()}});'+
    'function entry(){holder=create();key="callback";external(holder?.nested?.current?.[key]);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an optional dynamic member read must conservatively retain callables in its nested receiver');
});

test('a direct shared-reference alias preserves the instance callable',()=>{
  const source=
    'let owner;let alias;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){owner=new Local();alias=owner;external(alias.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a second binding to the same instance must preserve the callable member value');
});

test('an object-record alias remains fail-closed after a nested member mutation',()=>{
  const source=
    'let holder;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){holder={};const alias=holder;holder.nested=new Local();external(alias.nested.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an aliased object write must not cause the callable value to be treated as safe');
});

test('a member write through a local mutator parameter remains fail-closed',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(){const holder={};const alias=holder;install(holder);external(alias.nested.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an unresolved parameter alias must conservatively retain the callable value');
});

test('a factory returning a shared object remains fail-closed after nested callable mutation',()=>{
  const source=
    'let holder;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function getHolder(){return holder;}'+
    'function entry(){holder={};holder.nested=new Local();external(getHolder().nested.callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a shared object mutation must not make its nested callable appear safe');
});

// Precision boundary discovered red-first. This currently remains fail-closed
// because the object parameter aliases a private caller record, but the donor
// does not prove that alias across the local call edge:
// function install(target){target.nested=new Local();}
// function entry(){const holder={};install(holder);const callback=holder.nested.callback;return 0;}
// entry();
test.todo('prove a private object remains private when mutated through a known local function parameter');

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
