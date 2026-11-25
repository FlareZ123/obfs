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

test('a deferred field closure can publish a sibling callable through a captured instance binding without this',()=>{
  const source=
    'function hidden(){return 1;}'+
    'function entry(){let owner;'+
    'class Local{callback=hidden;leak=()=>external(owner.callback);}'+
    'owner=new Local();owner.leak();}'+
    'module.exports=entry;';

  const hidden=named(analyze(source),'hidden')[0];
  assert.ok(hidden,'the hidden field callable must have a summary');
  assert.equal(hidden.hostHeldCallable,true,
    'the field closure publishes owner.callback to an unknown host call through a captured instance binding');
  assert.equal(hidden.safe,false,
    'a callable that reaches external(owner.callback) cannot be classified safe');
});
