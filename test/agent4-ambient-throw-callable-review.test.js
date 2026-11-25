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

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

test('a callable thrown across the module boundary is HostHeldCallable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function thrower(){throw hidden;}'+
    'module.exports=thrower;';

  /** @type {{module:{exports:(()=>unknown)|null}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context);
  const exported=context.module.exports;
  assert.equal(typeof exported,'function');

  /** @type {unknown} */
  let caught;
  try {
    (/** @type {()=>unknown} */ (exported))();
  } catch(value) {
    caught=value;
  }
  assert.equal(typeof caught,'function',
    'the external caller receives the hidden callable as the thrown value');
  assert.match(Function.prototype.toString.call(caught),/function hidden/u,
    'the external caller can recover the hidden callable source');

  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden,'the hidden function must have a summary');
  assert.equal(hidden.hostHeldCallable,true,
    'throw/catch propagation must mark the thrown callable as externally held');
  assert.equal(hidden.safe,false,
    'a callable crossing an unmodelled exception boundary cannot be safe');
});


test('throwing a callable-bearing aggregate holds its nested functions',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function thrower(){throw {callback:hidden};}'+
    'module.exports=thrower;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('throwing a primitive does not hold unrelated callable values',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function thrower(){throw 7;}'+
    'module.exports=thrower;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});


test('a same-function catch that discards a thrown callable preserves the positive control',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function discard(){try{throw hidden;}catch(error){return 2;}}';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('a same-function catch that passes the thrown callable to a host holds it',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function expose(){try{throw hidden;}catch(error){external(error);}}';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a callable rethrown from a local catch remains host-held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function relay(){try{throw hidden;}catch(error){throw error;}}';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a throw from a nested function is not mistaken for a lexical local catch',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function caller(){try{(function(){throw hidden;})();}catch(error){return 2;}}';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});


test('an escaping closure propagates a locally caught callable to the host-held set',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){try{throw hidden;}catch(error){return ()=>error;}}'+
    'module.exports=entry;';
  /** @type {{module:{exports:(()=>unknown)|null}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function');
  const closure=(/** @type {()=>()=>unknown} */ (entry))();
  const caught=closure();
  assert.equal(typeof caught,'function');
  assert.match(Function.prototype.toString.call(caught),/function hidden/u);

  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'the escaped closure exposes the callable held in its captured catch binding');
  assert.equal(hidden.safe,false);
});

test('a non-escaping closure does not taint its captured callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const closure=()=>hidden;return 2;}';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});
