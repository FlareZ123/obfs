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


test('recursive local return expressions terminate while retaining a reachable callable base case',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function choose(flag){if(flag)return hidden;return choose(true);}'+
    'function entry(){external(choose(false));}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'recursive local return graphs must terminate without dropping callable base-case values');
});

test('a callable returned through a local identity parameter remains held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function identity(value){return value;}'+
    'function entry(){const owner=new Local();external(identity(owner).callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'actual-to-formal value substitution must compose with a returned object member read');
});

test('a class getter returning this.callback preserves the instance field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;get exposed(){return this.callback;}}'+
    'function entry(){const owner=new Local();external(owner.exposed);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a getter return using its receiver must resolve the callable field on the actual instance');
});

test('an inherited class getter returning this.callback preserves the subclass field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{get exposed(){return this.callback;}}'+
    'class Local extends Base{callback=hidden;}'+
    'function entry(){const owner=new Local();external(owner.exposed);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an inherited getter must resolve this against the concrete subclass instance');
});

test('an object getter returning this.callback preserves the object field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get exposed(){return this.callback;}};'+
    'function entry(){external(owner.exposed);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'an object getter return using this must resolve the receiver own-property value');
});

test('a class method returning this.callback preserves the instance field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;expose(){return this.callback;}}'+
    'function entry(){const owner=new Local();external(owner.expose());}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a local method return using this must resolve the actual receiver class field');
});


test('an object method returning this.callback preserves the object field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,expose(){return this.callback;}};'+
    'function entry(){external(owner.expose());}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a local object method return using this must resolve the actual receiver property');
});

test('an object getter resolves nested this member chains to the callable field',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={nested:{callback:hidden},get exposed(){return this.nested.callback;}};'+
    'function entry(){external(owner.exposed);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'nested this member chains in object getters must preserve the receiver field callable');
});

test('an object getter returning a primitive this member does not retain unrelated callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get value(){return this.count;}};'+
    'function entry(){external(owner.value);}'+
    'module.exports=entry;';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,false,
    'a getter returning a known primitive receiver field must not retain a sibling callable');
  assert.equal(hidden.safe,true);
});


test('mutually recursive local return expressions terminate with their callable base case',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function first(flag){if(flag)return hidden;return second();}'+
    'function second(){return first(true);}'+
    'function entry(){external(first(false));}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'mutually recursive return graphs must terminate and retain all reachable callable values');
});

test('a recursive factory return remains resolvable through a static member read',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function create(flag){if(flag)return new Local();return create(true);}'+
    'function entry(){external(create(false).callback);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'recursive factory-return paths must terminate without losing the instance field value');
});

test('an object method resolves nested this member chains to the callable field',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={nested:{callback:hidden},expose(){return this.nested.callback;}};'+
    'function entry(){external(owner.expose());}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'nested this member chains in object methods must preserve the receiver field callable');
});

test('an object method returning a primitive this member does not retain unrelated callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,read(){return this.count;}};'+
    'function entry(){external(owner.read());}'+
    'module.exports=entry;';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,false,
    'a method returning a known primitive receiver field must not retain a sibling callable');
  assert.equal(hidden.safe,true);
});

test('an object getter with a dynamic this key conservatively retains receiver callables',()=>{
  const source=
    'let key;'+
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get exposed(){return this[key];}};'+
    'function entry(){key="callback";external(owner.exposed);}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a dynamic this member key must fail closed over every callable reachable from the receiver');
});

test('an object getter returning an arrow that captures this preserves receiver callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get reader(){return ()=>this.callback;}};'+
    'function entry(){external(owner.reader());}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a returned arrow closure that captures the getter receiver can expose its callable fields');
});


test('a mutable local factory binding preserves its returned class-field callable',()=>{
  const source=
    'let owner,create;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'create=()=>new Local();'+
    'function leak(){external(owner.callback);}'+
    'function entry(){owner=create();leak();}'+
    'module.exports=entry;';
  assertHeld(hiddenSummary(source),
    'a factory assigned through a mutable local binding must resolve its callable return target');
});

test('multiple mutable factory assignments retain every possible returned callable field',()=>{
  const source=
    'let owner,create;'+
    'function hiddenA(){return 1;}'+
    'function hiddenB(){return 2;}'+
    'class First{callback=hiddenA;}'+
    'class Second{callback=hiddenB;}'+
    'function entry(flag){if(flag){create=()=>new First();}else{create=()=>new Second();}owner=create();external(owner.callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  assert.equal(named(result,'hiddenA')[0].hostHeldCallable,true,
    'the first assigned factory target must remain in the possible-call set');
  assert.equal(named(result,'hiddenB')[0].hostHeldCallable,true,
    'the second assigned factory target must remain in the possible-call set');
});

// The private mutator parameter precision boundary remains deliberately
// conservative: the donor does not yet prove caller-owned record privacy
// through a local function parameter, so member writes stay fail-closed.
test.todo('prove a private object remains private when mutated through a known local function parameter');


/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyzeScript(source) {
  return summarizeAmbientCallEffects(parse(source,'script'),'script');
}

/** @param {string} source @returns {ReturnType<typeof analyzeScript>['summaries'][number]} */
function hiddenScriptSummary(source) {
  const summary=named(analyzeScript(source),'hidden')[0];
  assert.ok(summary,'the hidden function expression must have an analysis summary');
  return summary;
}

test('a top-level classic-script class declaration exposes its deferred field callable',()=>{
  const source='class Local{callback=function hidden(){return 1;};}';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'a top-level class binding is available to the classic-script global lexical environment');
  assert.equal(hidden.safe,false,
    'the host can instantiate the class and read its callable field');
});

test('a top-level classic-script class expression binding exposes its deferred field callable',()=>{
  const source='const Local=class{callback=function hidden(){return 1;};};';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'a top-level lexical class-expression binding is available to the classic-script host');
  assert.equal(hidden.safe,false,
    'the host can instantiate the bound class and read its callable field');
});

test('a block-scoped classic-script class does not become globally reachable',()=>{
  const source='{class Local{callback=function hidden(){return 1;};}}';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,false,
    'a block lexical class binding is not a global script binding');
  assert.equal(hidden.safe,true,
    'an uninstantiated block-scoped class does not expose its field callable');
});

test('an uninstantiated module-local class field callable remains safe',()=>{
  const source='class Local{callback=function hidden(){return 1;};}';
  const hidden=hiddenSummary(source);
  assert.equal(hidden.externallyReachable,false);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});


test('a top-level classic-script object binding exposes its nested callable values',()=>{
  const source='const owner={callback:function hidden(){return 1;}};';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'the host can read callable properties from a top-level lexical object binding');
  assert.equal(hidden.safe,false);
});

test('a top-level classic-script instance binding exposes a block-local class field callable',()=>{
  const source=
    'let owner;'+
    '{class Local{callback=function hidden(){return 1;};}owner=new Local();}';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'the global instance binding exposes the class field even when the class name is block-local');
  assert.equal(hidden.safe,false);
});


test('a top-level classic-script object getter exposes a sibling callable through this',()=>{
  const source='const owner={callback:function hidden(){return 1;},get exposed(){return this.callback;}};';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'the host can invoke a globally reachable getter and receive its sibling callable');
  assert.equal(hidden.safe,false);
});

test('a top-level classic-script object method exposes a sibling callable through this',()=>{
  const source='const owner={callback:function hidden(){return 1;},expose(){return this.callback;}};';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'the host can invoke a globally reachable method and receive its sibling callable');
  assert.equal(hidden.safe,false);
});

test('a block-scoped classic-script object does not become globally reachable',()=>{
  const source='{const owner={callback:function hidden(){return 1;}};}';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,false,
    'a block lexical object binding is not visible from the global script environment');
  assert.equal(hidden.safe,true);
});

test('a var object declared inside a classic-script block remains globally reachable',()=>{
  const source='{var owner={callback:function hidden(){return 1;}};}';
  const hidden=hiddenScriptSummary(source);
  assert.equal(hidden.externallyReachable,true,
    'var remains function/global scoped even when its declaration appears in a block');
  assert.equal(hidden.safe,false);
});
