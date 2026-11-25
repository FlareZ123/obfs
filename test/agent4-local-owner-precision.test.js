'use strict';

const assert=require('node:assert/strict');
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

test('a fresh local own-data record does not publish a callable through its member write',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;return 2;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'a private own-data write into a non-escaping local record is not a host publication');
  assert.equal(hidden.safe,true);
});

test('a local record returned after a callable write publishes its stored callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;return owner;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'returning the owner publishes callable values written after its initializer');
  assert.equal(hidden.safe,false);
});

test('a callable read from a local record and passed to a host is held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;external(owner.callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'member reads must recover the callable value previously written to that field');
  assert.equal(hidden.safe,false);
});

test('passing the local record itself to a host holds its written callable fields',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;external(owner);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'aggregate escape must include callable values stored after object construction');
  assert.equal(hidden.safe,false);
});

test('a member write through an externally supplied receiver remains held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(owner){owner.callback=hidden;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a local object without an own data slot is not admitted as a private receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={};owner.callback=hidden;return 2;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an inherited setter may intercept a write when the own slot was not established');
  assert.equal(hidden.safe,false);
});

test('an aliased local receiver is not treated as privately owned',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};const alias=owner;alias.callback=hidden;return 2;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an unproved alias prevents the local receiver ownership proof');
  assert.equal(hidden.safe,false);
});


test('a callable read from a local record remains tracked through a local alias',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;'+
    'const callback=owner.callback;external(callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a local consumer may discard a callable read from a private record',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function consume(callback){return 2;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;'+
    'return consume(owner.callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'the local consumer is known to discard the actual callable');
  assert.equal(hidden.safe,true);
});

test('a local consumer returning a record field propagates the callable escape',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function consume(callback){return callback;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;'+
    'return consume(owner.callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a closure returned by a local consumer exposes a callable read from a record',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function make(callback){return ()=>callback;}'+
    'function entry(){const owner={callback:0};owner.callback=hidden;'+
    'return make(owner.callback);}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a local record with an accessor is not admitted as an own-data receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){const owner={get callback(){return 0;}};'+
    'owner.callback=hidden;return 2;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});


test('a with-body name lookup invalidates the local receiver ownership proof',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(proxy){const owner={callback:0};'+
    'with(proxy){owner.callback=hidden;}return 2;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'a Proxy-backed with environment can redirect the owner binding to host-owned storage');
  assert.equal(hidden.safe,false);
});


test('with fallback does not taint a callable in an unrelated sibling-function scope',()=>{
  const source=
    'function outer(){'+
    'function sibling(){function hidden(){return 1;}return 2;}'+
    'function entry(proxy){with(proxy){return 2;}}'+
    'return entry;}'+
    'module.exports=outer;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'a with environment cannot resolve a binding confined to a sibling function scope');
  assert.equal(hidden.safe,true);
});


test('with in one sibling function does not disable a private record proof in another',()=>{
  const source=
    'function outer(){'+
    'function sibling(){function hidden(){return 1;}'+
    'const owner={callback:0};owner.callback=hidden;return 2;}'+
    'function entry(proxy){with(proxy){return 2;}}'+
    'return entry;}'+
    'module.exports=outer;';
  const result=analyze(source);
  const hidden=named(result,'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'a with environment in entry cannot intercept member writes inside sibling');
  assert.equal(hidden.safe,true);
});
