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
function assertRuntimeHostReceivesHidden(source) {
  /** @type {unknown} */
  let observed=null;
  /** @type {{module:{exports:(()=>unknown)|null},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value) { observed=value; }
  };
  vm.runInNewContext(source,context);
  assert.equal(typeof context.module.exports,'function');
  (/** @type {()=>unknown} */ (context.module.exports))();
  assert.equal(typeof observed,'function',
    'the external host must receive the hidden class-field callable');
  assert.match(Function.prototype.toString.call(observed),/function hidden/u,
    'the host must recover the hidden callable source');
}

/** @param {string} source */
function assertHiddenHeld(source) {
  const hidden=analyze(source).summaries.find(summary=>summary.bindingNames.includes('hidden'));
  assert.ok(hidden,'the hidden function must have an analysis summary');
  assert.equal(hidden.hostHeldCallable,true,
    'the mutable factory call result must resolve to the callable field sent to the host');
  assert.equal(hidden.safe,false,
    'a callable returned through the mutable factory cannot be certified safe');
}

test('a mutable local arrow factory cannot hide its returned class-field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'owner=create();external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a mutable local factory alias to a function declaration cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;function make(){return new Local();}'+
    'create=make;owner=create();external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a mutable factory return exposes only the selected callable sibling',()=>{
  const source=
    'function hidden(){return 1;}function safe(){return 2;}'+
    'class Local{callback=hidden;unrelated=safe;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'owner=create();external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  const result=analyze(source);
  const hidden=result.summaries.find(summary=>summary.bindingNames.includes('hidden'));
  const safe=result.summaries.find(summary=>summary.bindingNames.includes('safe'));
  assert.ok(hidden);
  assert.ok(safe);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(safe.hostHeldCallable,false,
    'a sibling callable that is not selected by the host read remains unheld');
  assert.equal(safe.safe,true,
    'property-specific value flow must preserve unrelated private field yield');
});

test('multiple mutable factory assignments conservatively union all returned field callables',()=>{
  const source=
    'function hiddenA(){return 1;}function hiddenB(){return 2;}'+
    'class First{callback=hiddenA;}class Second{callback=hiddenB;}'+
    'function entry(){let owner;let create;create=()=>new First();create=()=>new Second();'+
    'owner=create();external(owner.callback);}'+
    'module.exports=entry;';
  /** @type {unknown} */
  let observed=null;
  /** @type {{module:{exports:(()=>unknown)|null},external:(value:unknown)=>void}} */
  const context={module:{exports:null},external(value){observed=value;}};
  vm.runInNewContext(source,context);
  assert.equal(typeof context.module.exports,'function');
  (/** @type {()=>unknown} */ (context.module.exports))();
  assert.equal(typeof observed,'function');
  assert.match(Function.prototype.toString.call(observed),/function hiddenB/u,
    'the last assignment is the runtime factory used by this execution');
  const result=analyze(source);
  for(const name of ['hiddenA','hiddenB']) {
    const summary=result.summaries.find(row=>row.bindingNames.includes(name));
    assert.ok(summary, name+' must have an analysis summary');
    assert.equal(summary.hostHeldCallable,true,
      'all possible mutable factory return branches must be retained conservatively');
  }
});

test('a recursive mutable factory return retains its concrete class-field branch',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=(flag)=>flag?new Local():create(true);'+
    'owner=create(true);external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a mutable factory invoked through Function.prototype.call cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'owner=create.call(null);external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a mutable factory invoked through Function.prototype.apply cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'owner=create.apply(null,[]);external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('an immediately invoked bound mutable factory cannot hide its returned field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'owner=create.bind(null)();external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a bound mutable factory stored in a local variable remains a positive control',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){let owner;let create;create=()=>new Local();'+
    'const bound=create.bind(null);owner=bound();external(owner.callback);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a local object method cannot hide a callback returned through its this receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:hidden,read(){return this.callback;}};'+
    'external(owner.read());}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a local object method cannot hide a callback passed through its this receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:hidden,read(){external(this.callback);}};'+
    'owner.read();}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a local object method returning a primitive does not retain an unrelated callable sibling',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:hidden,read(){return 7;}};'+
    'external(owner.read());}'+
    'module.exports=entry;';
  /** @type {unknown} */
  let observed=null;
  /** @type {{module:{exports:(()=>unknown)|null},external:(value:unknown)=>void}} */
  const context={module:{exports:null},external(value){observed=value;}};
  vm.runInNewContext(source,context);
  assert.equal(typeof context.module.exports,'function');
  (/** @type {()=>unknown} */ (context.module.exports))();
  assert.equal(observed,7);
  const hidden=analyze(source).summaries.find(summary=>summary.bindingNames.includes('hidden'));
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});


test('an object getter cannot hide a callback returned through its this receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:hidden,get read(){return this.callback;}};'+
    'external(owner.read);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('a class getter cannot hide a callback returned through its this receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;get read(){return this.callback;}}'+
    'function entry(){const owner=new Local();external(owner.read);}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});

test('an object setter cannot hide a callback passed through its this receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:hidden,set trigger(value){external(this.callback);}};'+
    'owner.trigger=1;}'+
    'module.exports=entry;';
  assertRuntimeHostReceivesHidden(source);
  assertHiddenHeld(source);
});
