'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @param {'commonjs'|'module'|'script'} [sourceType] */
function analyze(source,sourceType='commonjs') {
  return summarizeAmbientCallEffects(parse(source,sourceType),sourceType);
}

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

test('an uninstantiated private class does not publish a public field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('a local instance with no escaping use does not publish its field callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('exporting the class publishes public instance field callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'export class Local{callback=hidden;}';
  const hidden=named(analyze(source,'module'),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.externallyReachable,true,
    'exporting the class makes its public field callable externally reachable');
  assert.equal(hidden.hostHeldCallable,false,
    'the class export is an external-reachability effect, not a host-held field write');
  assert.equal(hidden.safe,false);
});

test('returning a class instance publishes its public field callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();return instance;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('passing a class instance to a host publishes its public field callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();external(instance);}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('passing a public class field value to a host publishes the callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();external(instance.callback);}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a local consumer may discard a callable read from a private instance field',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function consume(callback){return 2;}'+
    'function entry(){const instance=new Local();return consume(instance.callback);}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('a local consumer returning an instance field propagates the callable escape',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function consume(callback){return callback;}'+
    'function entry(){const instance=new Local();return consume(instance.callback);}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('an escaping arrow field propagates its captured callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=()=>hidden;}'+
    'function entry(){const instance=new Local();return instance;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a const alias used as a public field initializer is tracked when the instance escapes',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const callback=hidden;'+
    'class Local{callback=callback;}'+
    'function entry(){const instance=new Local();return instance;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a class with methods keeps field initializers conservatively held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;get(){return this.callback;}}'+
    'function entry(){const instance=new Local();return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a private class field keeps its callable initializer conservatively held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{#callback=hidden;}'+
    'function entry(){const instance=new Local();return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a static field keeps its callable initializer conservatively held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{static callback=hidden;}'+
    'function entry(){return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});


test('an eager side-effecting sibling field prevents deferral of callable fields',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;leak=(globalThis.saved=this);}'+
    'function entry(){const instance=new Local();return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an eager field initializer can publish the instance before later field reads');
  assert.equal(hidden.safe,false);
});


test('a reassigned function binding is not treated as a stable class field initializer',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function other(){return 2;}'+
    'hidden=other;'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();return instance;}'+
    'module.exports=entry;';
  const result=analyze(source);
  const other=named(result,'other')[0];
  assert.ok(other);
  assert.equal(other.hostHeldCallable,true,
    'the class field reads the reassigned function binding value');
  assert.equal(other.safe,false);
});


test('a field closure publishing this.callback keeps the field callable held',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;leak=()=>external(this.callback);}'+
    'function entry(){const instance=new Local();instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'the field closure can publish this.callback when invoked locally');
  assert.equal(hidden.safe,false);
});
