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

/** @param {string} source @param {Record<string,unknown>} [globals] @returns {unknown} */
function invokeExternal(source,globals={}) {
  let observed;
  /** @type {{module:{exports:unknown},external:(value:unknown)=>void}} */
  const context={
    module:{exports:null},
    external(value){observed=value;}
  };
  for(const [key,value] of Object.entries(globals))Reflect.set(context,key,value);
  vm.runInNewContext(source,context);
  const entry=context.module.exports;
  assert.equal(typeof entry,'function','the source must export an entry function');
  /** @type {()=>void} */
  const invoke=/** @type {()=>void} */ (entry);
  invoke();
  return observed;
}

/** @param {string} source @param {string} message @param {Record<string,unknown>} [globals] */
function assertHeldAndObserved(source,message,globals={}) {
  const observed=invokeExternal(source,globals);
  assert.equal(typeof observed,'function',message);
  assert.equal(/** @type {{name?:unknown}} */ (observed).name,'hidden',message);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,message);
  assert.equal(summary.safe,false,message);
}

test('later object spread can overwrite an earlier static property with a callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'const base={callback:hidden};'+
    'const owner={callback:()=>0,...base};'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'a later spread overwrites callback, so the callable copied from base reaches external');
});

test('a later explicit property safely overwrites an earlier spread callable',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'const base={callback:hidden};'+
    'const owner={...base,callback:()=>0};'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false,
    'the final explicit data property overwrites the spread callback');
  assert.equal(summary.safe,true);
  const observed=invokeExternal(source);
  assert.equal(typeof observed,'function');
  assert.notEqual(/** @type {{name?:unknown}} */ (observed).name,'hidden');
});

test('an unknown computed class field can overwrite a statically named field',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'const key=globalThis.FIELD_NAME;'+
    'class Local{callback=()=>0;[key]=hidden;}'+
    'const owner=new Local();'+
    'external(owner.callback);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'the runtime computed field key is callback and overwrites the earlier field',
    {FIELD_NAME:'callback'});
});

test('an object method returning this.callback carries its actual receiver',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,reveal(){return this.callback;}};'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'the local method returns the callback property of its actual owner receiver');
});

test('an object getter returning this.callback carries its actual receiver',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get reveal(){return this.callback;}};'+
    'external(owner.reveal);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'the getter returns the callback property of its actual owner receiver');
});

test('a class method returning this.callback carries its instance receiver',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;reveal(){return this.callback;}}'+
    'const owner=new Local();'+
    'external(owner.reveal());'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'the class method returns the callback field of the actual instance');
});

test('a class getter returning this.callback carries its instance receiver',()=>{
  const source=
    'function entry(){'+
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;get reveal(){return this.callback;}}'+
    'const owner=new Local();'+
    'external(owner.reveal);'+
    '}'+
    'module.exports=entry;';
  assertHeldAndObserved(source,
    'the class getter returns the callback field of the actual instance');
});
