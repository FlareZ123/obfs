'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source */
function analyzeCommonJs(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source */
function analyzeScript(source) {
  return summarizeAmbientCallEffects(parse(source,'script'),'script');
}

/** @param {ReturnType<typeof analyzeCommonJs>|ReturnType<typeof analyzeScript>} result */
function hiddenSummary(result) {
  const summary=result.summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

/**
 * Execute a source string in a CommonJS-shaped wrapper with a host-owned
 * callback. The wrapper keeps module-local declarations out of the VM global.
 * @param {string} source
 * @returns {{observed:unknown,exported:unknown,context:{module:{exports:unknown},exports:unknown,external:(value:unknown)=>void}}}
 */
function executeCommonJs(source) {
  /** @type {unknown} */
  let observed=null;
  const moduleObject={exports:{}};
  /** @type {{module:{exports:unknown},exports:unknown,external:(value:unknown)=>void}} */
  const context={
    module:moduleObject,
    exports:moduleObject.exports,
    external(value) { observed=value; }
  };
  const wrapped=
    '(function(exports,require,module,__filename,__dirname){'+
    source+'\n'+
    '})(exports,()=>{},module,"/virtual/test.cjs","/virtual");';
  vm.runInNewContext(wrapped,context);
  return {observed,exported:context.module.exports,context};
}

/**
 * Execute classic-script source, then evaluate a host-selected expression in
 * the same realm to model the host reading a global lexical binding.
 * @param {string} source
 * @param {string} expression
 * @returns {unknown}
 */
function executeScriptExpression(source,expression) {
  /** @type {Record<string,unknown>} */
  const context={};
  vm.runInNewContext(source,context);
  return vm.runInNewContext(expression,context);
}

/** @param {unknown} value @param {string} description */
function assertHiddenFunction(value,description) {
  assert.equal(typeof value,'function',description+' must yield a function');
  const source=Function.prototype.toString.call(value);
  assert.ok(source.includes('function hidden'),description+' must expose the original hidden function source');
}

test('runtime host observation of an object getter return is reflected as HostHeldCallable',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get exposed(){return this.callback;}};'+
    'external(owner.exposed);module.exports=owner;';
  const runtime=executeCommonJs(source);
  assertHiddenFunction(runtime.observed,'the getter handoff');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('runtime host observation of an object method return binds this to the receiver',()=>{
  const source=
    'function hidden(){return 2;}'+
    'const owner={callback:hidden,expose(){return this.callback;}};'+
    'external(owner.expose());module.exports=owner;';
  const runtime=executeCommonJs(source);
  assertHiddenFunction(runtime.observed,'the method-return handoff');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a receiver method that directly sends this.callback to the host is not treated as private',()=>{
  const source=
    'function hidden(){return 3;}'+
    'const owner={callback:hidden,expose(){external(this.callback);}};'+
    'owner.expose();module.exports=owner;';
  const runtime=executeCommonJs(source);
  assertHiddenFunction(runtime.observed,'the direct method sink');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('nested this member chains in an object getter preserve the callable receiver value',()=>{
  const source=
    'function hidden(){return 4;}'+
    'const owner={nested:{callback:hidden},get exposed(){return this.nested.callback;}};'+
    'external(owner.exposed);module.exports=owner;';
  const runtime=executeCommonJs(source);
  assertHiddenFunction(runtime.observed,'the nested getter handoff');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a dynamic this key conservatively preserves every callable reachable from the receiver',()=>{
  const source=
    'const key="callback";'+
    'function hidden(){return 5;}'+
    'const owner={callback:hidden,get exposed(){return this[key];}};'+
    'external(owner.exposed);module.exports=owner;';
  const runtime=executeCommonJs(source);
  assertHiddenFunction(runtime.observed,'the dynamic-key getter handoff');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,true);
  assert.equal(hidden.safe,false);
});

test('a primitive this member getter does not retain an unrelated callable sibling',()=>{
  const source=
    'function hidden(){return 6;}'+
    'const owner={callback:hidden,count:17,get value(){return this.count;}};'+
    'external(owner.value);';
  const runtime=executeCommonJs(source);
  assert.equal(runtime.observed,17);
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('a top-level classic-script class exposes its deferred field callable to the host',()=>{
  const source='class Local{callback=function hidden(){return 7;};}';
  const value=executeScriptExpression(source,'new Local().callback');
  assertHiddenFunction(value,'the top-level class binding');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,true);
  assert.equal(hidden.safe,false);
});

test('a top-level classic-script class-expression binding exposes its field callable',()=>{
  const source='const Local=class{callback=function hidden(){return 8;};};';
  const value=executeScriptExpression(source,'new Local().callback');
  assertHiddenFunction(value,'the top-level class-expression binding');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,true);
  assert.equal(hidden.safe,false);
});

test('a top-level classic-script object binding exposes its nested callable',()=>{
  const source='const owner={callback:function hidden(){return 9;}};';
  const value=executeScriptExpression(source,'owner.callback');
  assertHiddenFunction(value,'the top-level object binding');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,true);
  assert.equal(hidden.safe,false);
});

test('a global instance assigned from a block-local class exposes its field callable',()=>{
  const source=
    'let owner;'+
    '{class Local{callback=function hidden(){return 10;};}owner=new Local();}';
  const value=executeScriptExpression(source,'owner.callback');
  assertHiddenFunction(value,'the top-level instance binding');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,true);
  assert.equal(hidden.safe,false);
});

test('a block-scoped classic-script class does not publish its uninstantiated field callable',()=>{
  const source='{class Local{callback=function hidden(){return 11;};}}';
  const context={};
  vm.runInNewContext(source,context);
  assert.equal(vm.runInNewContext('typeof Local',context),'undefined');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,false);
  assert.equal(hidden.safe,true);
});

test('a block-scoped classic-script object does not publish its callable binding',()=>{
  const source='{const owner={callback:function hidden(){return 12;}};}';
  const context={};
  vm.runInNewContext(source,context);
  assert.equal(vm.runInNewContext('typeof owner',context),'undefined');
  const hidden=hiddenSummary(analyzeScript(source));
  assert.equal(hidden.externallyReachable,false);
  assert.equal(hidden.safe,true);
});

test('a CommonJS module-local class does not become a host-reachable global binding',()=>{
  const source='class Local{callback=function hidden(){return 13;};}';
  const runtime=executeCommonJs(source);
  assert.equal(typeof runtime.exported,'object');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.externallyReachable,false);
  assert.equal(hidden.hostHeldCallable,false);
  assert.equal(hidden.safe,true);
});

test('an exported factory returning a class instance exposes the instance field callable',()=>{
  const source=
    'function hidden(){return 14;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'module.exports=create;';
  const runtime=executeCommonJs(source);
  assert.equal(typeof runtime.exported,'function');
  const create=/** @type {()=>{callback:unknown}} */ (runtime.exported);
  const instance=create();
  assertHiddenFunction(instance.callback,'the exported-factory instance field');
  const hidden=hiddenSummary(analyzeCommonJs(source));
  assert.equal(hidden.externallyReachable,true,
    'exporting a factory must propagate external reachability through its returned instance fields');
  assert.equal(hidden.safe,false);
});
