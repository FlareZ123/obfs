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

/** @param {ReturnType<typeof analyze>} result */
function hiddenSummary(result) {
  const summary=result.summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden callback must have an analysis summary');
  return summary;
}

test('a private owner mutated only through a known local parameter can retain its callback',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(){const holder={};install(holder);return typeof holder.nested.callback;}'+
    'module.exports=entry;';
  const context={module:{exports:null}};
  vm.runInNewContext(source,context);
  assert.equal(context.module.exports(),'function');
  const summary=hiddenSummary(analyze(source));
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true,
    'the object remains private when every call and parameter use is statically bounded');
});

test('a local owner exposed before mutation does not receive a private-mutator proof',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(){const holder={};external(holder);install(holder);}'+
    'module.exports=entry;';
  /** @type {unknown} */
  let observed=null;
  const context={module:{exports:null},external(value){observed=value;}};
  vm.runInNewContext(source,context);
  context.module.exports();
  assert.equal(typeof /** @type {{nested?:{callback?:unknown}}} */ (observed)?.nested?.callback,'function');
  const summary=hiddenSummary(analyze(source));
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});

test('a mutator called with an externally supplied owner remains fail-closed',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target){target.nested=new Local();}'+
    'function entry(target){install(target);}'+
    'module.exports=entry;';
  /** @type {{nested?:{callback?:unknown}}} */
  const observed={};
  const context={module:{exports:null}};
  vm.runInNewContext(source,context);
  context.module.exports(observed);
  assert.equal(typeof observed.nested?.callback,'function');
  const summary=hiddenSummary(analyze(source));
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});

test('dynamic-key writes through a mutator parameter remain fail-closed',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target,key){target[key]=new Local();}'+
    'function entry(){const holder={};install(holder,"nested");return typeof holder.nested.callback;}'+
    'module.exports=entry;';
  const context={module:{exports:null}};
  vm.runInNewContext(source,context);
  assert.equal(context.module.exports(),'function');
  const summary=hiddenSummary(analyze(source));
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});

test('an unmodeled call inside a mutator prevents private-owner certification',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Local{callback=hidden;}'+
    'function install(target){external(target);target.nested=new Local();}'+
    'function entry(){const holder={};install(holder);}'+
    'module.exports=entry;';
  const summary=hiddenSummary(analyze(source));
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});
