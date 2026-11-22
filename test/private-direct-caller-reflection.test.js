'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/**
 * Execute a CommonJS source with an externally supplied ordinary function
 * that can inspect the source of its immediate non-strict caller.
 * @param {string} code
 * @param {Function|undefined} spy
 * @param {object|undefined} [host]
 * @returns {unknown}
 */
function execute(code,spy,host) {
  const module={exports:null};
  vm.runInNewContext(code,{module,spy,host},{timeout:3000});
  return module.exports;
}

/**
 * Compiler metrics are printed with every comparison to preserve the
 * distinction between a source-preserving refusal and a real transformed
 * source. No source observer is added to the non-observer positive control.
 * @param {string} code
 * @param {string} label
 * @param {Function|undefined} [spy]
 * @param {object|undefined} [host]
 * @returns {void}
 */
function compare(code,label,spy,host) {
  const expected=execute(code,spy,host);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const generated=obfuscateFiles([
      {path:'target.cjs',sourceType:'commonjs',code}
    ],{
      mode,seed:'caller-source-observer-'+label+'-'+mode,
      closedWorld:false,strings:false,identifiers:false,properties:true
    });
    const output=String(generated.files[0].code);
    const actual=execute(output,spy,host);
    const renamed=generated.files[0].metrics.properties;
    console.log('CALLER_SOURCE_OBSERVER '+JSON.stringify({
      label,mode,expected,actual,renamed,
      sourceChanged:output!==code
    }));
    assert.deepEqual(actual,expected,
      label+'/'+mode+': caller-visible Function#toString must retain native behavior');
  }
}

/**
 * Plain functions in these fixtures are deliberately non-strict: legacy
 * Function.caller is exposed in that runtime and may return a direct caller
 * when the called function's source itself is otherwise private.
 */
test('direct legacy Function.caller source introspection preserves private-function behavior',()=>{
  const source=[
    'function spy(){',
    '  const caller=spy.caller;',
    '  return caller&&caller.toString().includes("secretField")?7:8;',
    '}',
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return spy()+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined),8);
  compare(source,'local-spy');
});

test('a separately supplied host observer can inspect a direct private caller',()=>{
  const spy=/** @type {Function} */ (vm.runInNewContext([
    '(function spy(){',
    '  const caller=spy.caller;',
    '  return caller&&caller.toString().includes("secretField")?7:8;',
    '})'
  ].join('\n')));
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return spy()+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,spy),8);
  compare(source,'foreign-spy',spy);
});

test('unobserved private direct function retains a genuinely renamed private key',()=>{
  const source='function privateFn(){const secret={secretField:1};'+
    'return secret.secretField+7;}module.exports=privateFn();';
  assert.equal(execute(source,undefined),8);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const emitted=obfuscateFiles([{path:'control.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'caller-source-positive-'+mode,
      closedWorld:false,strings:false,identifiers:false,properties:true
    });
    assert.equal(execute(String(emitted.files[0].code),undefined),8);
    assert.equal(emitted.files[0].metrics.properties,1,
      mode+': uninvolved source-unobservable private owner should stay transformable');
  }
});


test('an externally owned property getter can observe the source of its private caller',()=>{
  const getter=/** @type {()=>number} */ (vm.runInNewContext([
    '(function reader(){',
    '  const caller=reader.caller;',
    '  return caller&&caller.toString().includes("secretField")?7:8;',
    '})'
  ].join('\n')));
  const host=Object.defineProperty({},'value',{get:getter});
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return host.value+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined,host),8);
  compare(source,'host-getter',undefined,host);
});
