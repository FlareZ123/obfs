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


test('a field initializer function that uses this is not deferred through its binding',()=>{
  const source=
    'function hidden(){external(this.callback);}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();instance.callback();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'the field function can publish its own instance field through this.callback');
  assert.equal(hidden.safe,false);
});


test('a function-declaration field initializer cannot publish a sibling field through its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function leak(){external(this.callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'calling an identifier-initialized field function with the instance as this publishes this.callback');
  assert.equal(hidden.safe,false);
});

test('a const-bound function-expression field initializer cannot publish a sibling field through its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const leak=function(){external(this.callback);};'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'identifier-initialized callable aliases must preserve receiver-based field escape');
  assert.equal(hidden.safe,false);
});


test('an inherited prototype setter does not observe a public class field definition',()=>{
  const source=
    'Object.defineProperty(Object.prototype,"callback",{set(value){external(value);}});'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function entry(){const instance=new Local();return 2;}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'public class fields define own data properties without invoking inherited setters');
  assert.equal(hidden.safe,true);
});


test('a mutable closure alias to a local class instance cannot publish a sibling field through an identifier field function',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner.callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();owner=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'the field function closes over a mutable alias assigned the instance before the local call');
  assert.equal(hidden.safe,false);
});


test('a function-local closure alias to a class instance cannot publish a sibling field through an identifier field function',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){'+
      'let owner;'+
      'function leak(){external(owner.callback);}'+
      'class Local{callback=hidden;leak=leak;}'+
      'const instance=new Local();owner=instance;instance.leak();'+
    '}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'the class-field function closes over a function-local mutable alias assigned the instance before invocation');
  assert.equal(hidden.safe,false);
});


test('an inline function field cannot publish a sibling field through a mutable closure alias',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;leak=function(){external(owner.callback);};}'+
    'function entry(){const instance=new Local();owner=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an inline field function can read the instance through a mutable captured binding');
  assert.equal(hidden.safe,false);
});

test('an arrow field cannot publish a sibling field through a mutable closure alias',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;leak=()=>external(owner.callback);}'+
    'function entry(){const instance=new Local();owner=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an arrow field can read the instance through a mutable captured binding');
  assert.equal(hidden.safe,false);
});


test('a captured mutable object property cannot publish a sibling field through an identifier field function',()=>{
  const source=
    'const holder={current:null};'+
    'function hidden(){return 1;}'+
    'function leak(){external(holder.current.callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();holder.current=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'a captured object property assigned the instance must preserve the sibling field escape');
  assert.equal(hidden.safe,false);
});


test('a captured accessor-backed holder cannot publish a sibling field through an identifier field function',()=>{
  const source=
    'let stored;'+
    'const holder={get current(){return stored;},set current(value){stored=value;}};'+
    'function hidden(){return 1;}'+
    'function leak(){external(holder.current.callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();holder.current=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an accessor-backed holder that returns the instance must preserve the sibling field escape');
  assert.equal(hidden.safe,false);
});


test('a dynamic member key on a mutable closure alias cannot hide a sibling field escape',()=>{
  const source=
    'let owner;let key;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner[key]);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();owner=instance;key="callback";instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'an unknown computed key must conservatively retain callables reachable from the mutable instance alias');
  assert.equal(hidden.safe,false);
});


test('destructuring a callable field from a mutable closure alias cannot hide its host escape',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function leak(){const {callback}=owner;external(callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function entry(){const instance=new Local();owner=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'destructured sibling field values from a mutable closure alias must remain held');
  assert.equal(hidden.safe,false);
});

test('a local factory return assigned to a mutable closure alias cannot hide a sibling field escape',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner.callback);}'+
    'class Local{callback=hidden;leak=leak;}'+
    'function create(){return new Local();}'+
    'function entry(){owner=create();owner.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,true,
    'class instances returned by a local factory must flow through mutable closure aliases');
  assert.equal(hidden.safe,false);
});


test('reading a non-callable field through a mutable closure alias does not publish unrelated callables',()=>{
  const source=
    'let owner;'+
    'function hidden(){return 1;}'+
    'function leak(){external(owner.value);}'+
    'class Local{callback=hidden;value=1;leak=leak;}'+
    'function entry(){const instance=new Local();owner=instance;instance.leak();}'+
    'module.exports=entry;';
  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false,
    'a read of a primitive sibling field must not retain unrelated callable fields');
  assert.equal(hidden.safe,true);
});
