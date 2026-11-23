'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @param {string} seed @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function compile(code,seed) {
  const result=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code
  }],{
    mode:'coo',seed,properties:true,identifiers:true,strings:false
  });
  assert.equal(result.files.length,1);
  return result.files[0];
}

/** @param {string} code @returns {{value:number,source:string}} */
function evaluate(code) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1500});
  return /** @type {{value:number,source:string}} */(context.module.exports);
}
test('one source-observed callable currently vetoes unrelated private property and identifier rewrites',()=>{
  const baseline=[
    'const observedSource="";',
    'const helperRecord={unrelatedPrivate:7};',
    'function helper(){return helperRecord.unrelatedPrivate;}',
    'function sample(){return observedSource.length+helper();}',
    'module.exports={value:sample(),source:observedSource};'
  ].join('\n');
  const observed=[
    'function inspect(){const observedRecord={observedPrivate:29};return observedRecord.observedPrivate;}',
    'const observedSource=Function.prototype.toString.call(inspect);',
    'const helperRecord={unrelatedPrivate:7};',
    'function helper(){return helperRecord.unrelatedPrivate;}',
    'function sample(){return observedSource.length+inspect()+helper();}',
    'module.exports={value:sample(),source:observedSource};'
  ].join('\n');

  assert.equal(observesFunctionSource(parse(observed,'script')),true,
    'Function#toString of inspect must be recognized as a source observer');

  const baselineOut=compile(baseline,'source-observer-property-scope-baseline');
  assert.ok(baselineOut.metrics.properties>=1,String(baselineOut.code));
  assert.ok(baselineOut.metrics.bindings>=1,String(baselineOut.code));
  assert.ok(!baselineOut.code.includes('unrelatedPrivate'),String(baselineOut.code));
  assert.ok(!baselineOut.code.includes('helperRecord'),String(baselineOut.code));

  const observedOut=compile(observed,'source-observer-property-scope-witness');
  // Expected-red witness for the current whole-AST boolean veto. The observed
  // callable's source must remain stable, but the unrelated helper is private.
  assert.equal(observedOut.metrics.properties,0,String(observedOut.code));
  assert.equal(observedOut.metrics.bindings,0,String(observedOut.code));
  assert.ok(observedOut.code.includes('observedPrivate'),String(observedOut.code));
  assert.ok(observedOut.code.includes('unrelatedPrivate'),String(observedOut.code));
  assert.ok(observedOut.code.includes('helperRecord'),String(observedOut.code));

  const before=evaluate(observed);
  const after=evaluate(String(observedOut.code));
  assert.equal(after.value,before.value);
  assert.equal(after.source,before.source);
  console.log(JSON.stringify({
    sourceObserverDetected:true,
    baseline:{properties:baselineOut.metrics.properties,bindings:baselineOut.metrics.bindings},
    withObserver:{properties:observedOut.metrics.properties,bindings:observedOut.metrics.bindings},
    unrelatedPropertyRenamed:false,
    unrelatedBindingRenamed:false,
    observedCallableSourcePreserved:after.source===before.source
  }));
});
