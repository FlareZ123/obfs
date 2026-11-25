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
