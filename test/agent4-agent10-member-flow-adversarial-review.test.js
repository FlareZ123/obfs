'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
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

/** @param {string} source @param {string} message */
function assertHeld(source,message) {
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,message);
  assert.equal(summary.safe,false,message);
}

test('later object spread can overwrite an earlier static property with a callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const base={callback:hidden};'+
    'const owner={callback:()=>0,...base};'+
    'function entry(){external(owner.callback);}'+
    'module.exports=entry;';
  assertHeld(source,
    'a later spread overwrites callback, so the callable copied from base reaches external');
});

test('a later explicit property safely overwrites an earlier spread callable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const base={callback:hidden};'+
    'const owner={...base,callback:()=>0};'+
    'function entry(){external(owner.callback);}'+
    'module.exports=entry;';
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false,
    'the final explicit data property overwrites the spread callback');
  assert.equal(summary.safe,true);
});

test('an unknown computed class field can overwrite a statically named field',()=>{
  const source=
    'function hidden(){return 1;}'+
    "const key='call'+'back';"+
    'class Local{callback=()=>0;[key]=hidden;}'+
    'const owner=new Local();'+
    'function entry(){external(owner.callback);}'+
    'module.exports=entry;';
  assertHeld(source,
    'the computed field key evaluates to callback and overwrites the earlier field');
});

test('an object method returning this.callback carries its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,reveal(){return this.callback;}};'+
    'function entry(){external(owner.reveal());}'+
    'module.exports=entry;';
  assertHeld(source,
    'the local method returns the callback property of its actual owner receiver');
});

test('an object getter returning this.callback carries its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get reveal(){return this.callback;}};'+
    'function entry(){external(owner.reveal);}'+
    'module.exports=entry;';
  assertHeld(source,
    'the getter returns the callback property of its actual owner receiver');
});

test('a class method returning this.callback carries its instance receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;reveal(){return this.callback;}}'+
    'const owner=new Local();'+
    'function entry(){external(owner.reveal());}'+
    'module.exports=entry;';
  assertHeld(source,
    'the class method returns the callback field of the actual instance');
});
