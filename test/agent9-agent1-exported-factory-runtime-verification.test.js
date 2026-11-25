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

/** @param {string} source @returns {{exported:unknown,context:{module:{exports:unknown},exports:unknown}}} */
function executeCommonJs(source) {
  const moduleObject={exports:{}};
  /** @type {{module:{exports:unknown},exports:unknown}} */
  const context={module:moduleObject,exports:moduleObject.exports};
  const wrapped=
    '(function(exports,require,module,__filename,__dirname){'+
    source+'\n'+
    '})(exports,()=>{},module,"/virtual/exported-factory.cjs","/virtual");';
  vm.runInNewContext(wrapped,context);
  return {exported:context.module.exports,context};
}

/** @param {unknown} value */
function assertHiddenFunction(value) {
  assert.equal(typeof value,'function');
  assert.ok(Function.prototype.toString.call(value).includes('function hidden'));
}

/** @param {string} source */
function assertHiddenHeld(source) {
  const hidden=analyze(source).summaries.find(summary=>summary.bindingNames.includes('hidden'));
  assert.ok(hidden,'the hidden function must have an analysis summary');
  assert.equal(hidden.hostHeldCallable,true,
    'an exported callable return must be treated as host-held even when the function is never invoked in the module');
  assert.equal(hidden.safe,false);
}

test('an exported factory returning a class instance exposes its field callable',()=>{
  const source=
    'function hidden(){return 14;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  const create=/** @type {()=>{callback:unknown}} */ (runtime.exported);
  assertHiddenFunction(create().callback);
  assertHiddenHeld(source);
});

test('an exported factory returning an object exposes its callable property',()=>{
  const source=
    'function hidden(){return 15;}'+
    'const create=()=>({callback:hidden});'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  const create=/** @type {()=>{callback:unknown}} */ (runtime.exported);
  assertHiddenFunction(create().callback);
  assertHiddenHeld(source);
});

test('an exported factory returning a callable directly exposes that callable',()=>{
  const source=
    'function hidden(){return 16;}'+
    'const create=()=>hidden;'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  const create=/** @type {()=>unknown} */ (runtime.exported);
  assertHiddenFunction(create());
  assertHiddenHeld(source);
});

test('an exported nested factory return closure exposes the terminal callable',()=>{
  const source=
    'function hidden(){return 17;}'+
    'const create=()=>()=>hidden;'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  const create=/** @type {()=>()=>unknown} */ (runtime.exported);
  assertHiddenFunction(create()());
  assertHiddenHeld(source);
});

test('an exported factory returning only a primitive does not retain an unrelated callable',()=>{
  const source=
    'function hidden(){return 18;}'+
    'const create=()=>23;'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  const create=/** @type {()=>unknown} */ (runtime.exported);
  assert.equal(create(),23);
  const hidden=analyze(source).summaries.find(summary=>summary.bindingNames.includes('hidden'));
  assert.ok(hidden);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});
