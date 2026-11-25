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
