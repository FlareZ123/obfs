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

/** @param {string} source @returns {unknown} */
function execute(source) {
  /** @type {unknown} */
  let observed=null;
  const context={external(value){observed=value;}};
  vm.runInNewContext(source,context);
  return observed;
}

/** @param {string} source */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'hidden function summary must exist');
  return summary;
}

test('a known local mutator parameter cannot make a private callable falsely safe',()=>{
  const source=
    'function hidden(){return 31;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(){const holder={};install(holder);return holder.nested.callback();}'+
    'entry();';
  assert.equal(execute(source),null,
    'the private entry path does not hand a callable to the host');
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,true,
    'the unresolved parameter-alias mutation remains conservatively held');
  assert.equal(hidden.safe,false,
    'the helper must not claim a privacy proof across an unmodelled mutator alias');
});

test('the same local mutator path is held when the installed callback is actually handed to the host',()=>{
  const source=
    'function hidden(){return 32;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(){const holder={};install(holder);external(holder.nested.callback);}'+
    'entry();';
  const observed=execute(source);
  assert.equal(typeof observed,'function');
  assert.equal(Function.prototype.toString.call(observed).includes('function hidden'),true);
  const hidden=hiddenSummary(source);
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});
