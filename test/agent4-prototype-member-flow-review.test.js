'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source @returns {ReturnType<typeof analyze>['summaries'][number]} */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(item=>item.bindingNames.includes('hidden'));
  assert.ok(summary,'hidden must have an analysis summary');
  return summary;
}

/** @param {string} source @returns {unknown} */
function invokeExternal(source) {
  let observed;
  /** @type {{module:{exports:unknown},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value){observed=value;}
  };
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function');
  /** @type {()=>void} */
  const invoke=/** @type {()=>void} */ (entry);
  invoke();
  return observed;
}

/** @param {string} source @param {string} message */
function assertHeldAndObserved(source,message) {
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function',message);
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden',message);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,message);
  assert.equal(summary.safe,false,message);
}

test('function-constructor prototype property assignment exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'Local.prototype.callback is inherited by the constructed instance');
});

test('class prototype property assignment exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the assigned class prototype callback is inherited by the instance');
});

test('function-constructor prototype replacement exposes its callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype={callback:hidden};'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the replacement prototype object supplies callback');
});

test('a function-constructor prototype method returns its receiver callback',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'Local.prototype.reveal=function(){return this.callback;};'+
    'const owner=new Local();'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the prototype method returns the callback on the instance receiver');
});

test('a class prototype method returns its receiver callback',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{}'+
    'Local.prototype.callback=hidden;'+
    'Local.prototype.reveal=function(){return this.callback;};'+
    'const owner=new Local();'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the class prototype method returns the callback on the instance receiver');
});

test('a derived class inherits a callable assigned to the base prototype',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Base{}'+
    'Base.prototype.callback=hidden;'+
    'class Derived extends Base{}'+
    'const owner=new Derived();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the derived instance inherits the callable base prototype field');
});

test('a function constructor returning an object exposes the replacement object field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){return {callback:hidden};}'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the explicit object return replaces the constructed instance');
});

test('a class constructor returning an object overrides its declared callable field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{callback=()=>0;constructor(){return {callback:hidden};}}'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the constructor object return overrides the initialized class field');
});

test('a prototype getter exposes its returned callable through a property read',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function Local(){}'+
    'Object.defineProperty(Local.prototype,"callback",{get(){return hidden;}});'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the prototype getter returns hidden when callback is read');
});


test('a function-constructor own assignment shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){this.callback=harmless;}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a class instance field shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'class Local{callback=harmless;}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

test('a later own assignment shadows its prototype callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'owner.callback=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless');
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});

/** @param {string} source @param {string} message */
function assertRetainedButNotObserved(source,message) {
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function',message);
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'harmless',message);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,message);
  assert.equal(summary.safe,false,message);
}

test('one shadowed instance does not hide a second unshadowed instance',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const shadowed=new Local();'+
    'shadowed.callback=harmless;'+
    'const exposed=new Local();'+
    'external(exposed.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the second instance still inherits the prototype callable');
});

test('conditional own write does not prove a prototype shadow',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'if(false){owner.callback=harmless;}'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'a conditional own write may not execute');
});

test('an own write after the read does not shadow the earlier prototype observation',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    'owner.callback=harmless;'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'the prototype callable was observed before the later own write');
});

test('a dynamic own write remains conservative even when runtime key matches',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function Local(){}'+
    'Local.prototype.callback=hidden;'+
    'globalThis.FIELD_NAME="callback";'+
    'const owner=new Local();'+
    'owner[globalThis.FIELD_NAME]=harmless;'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertRetainedButNotObserved(source,'unknown computed instance write is not proof of a static shadow');
});

test('a constructor call after its own write invalidates the shadow proof',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'function harmless(){return 0;}'+
    'function mutate(owner){delete owner.callback;}'+
    'function Local(){this.callback=harmless;mutate(this);}'+
    'Local.prototype.callback=hidden;'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,'constructor call may delete the own property and expose the prototype value');
});
