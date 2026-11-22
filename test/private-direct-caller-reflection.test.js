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
  /** @type {{mode:string,expected:unknown,actual:unknown}[]} */
  const mismatches=[];
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
    if(!Object.is(actual,expected))mismatches.push({mode,expected,actual});
  }
  assert.deepEqual(mismatches,[],
    label+': caller-visible Function#toString must retain native behavior in every mode');
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

test('foreign implicit coercion can observe source through Symbol.toPrimitive',()=>{
  const probe=/** @type {()=>number} */ (vm.runInNewContext(
    '(function probe(){const caller=probe.caller;'+
    'return caller&&caller.toString().includes("secretField")?7:8;})'
  ));
  const host={ [Symbol.toPrimitive]:probe };
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return host+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined,host),8);
  compare(source,'implicit-primitive-coercion',undefined,host);
});

test('foreign Proxy.has trap can inspect caller without an explicit call',()=>{
  const trap=/** @type {()=>boolean} */ (vm.runInNewContext(
    '(function hasTrap(){const caller=hasTrap.caller;'+
    'return Boolean(caller&&caller.toString().includes("secretField"));})'
  ));
  const host=new Proxy({}, {has:trap});
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return ("value" in host?7:8)+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined,host),8);
  compare(source,'proxy-has-trap',undefined,host);
});

test('foreign Symbol.hasInstance can observe an otherwise direct-only caller',()=>{
  const probe=/** @type {()=>boolean} */ (vm.runInNewContext(
    '(function hasInstance(){const caller=hasInstance.caller;'+
    'return Boolean(caller&&caller.toString().includes("secretField"));})'
  ));
  const host={ [Symbol.hasInstance]:probe };
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  return ({} instanceof host?7:8)+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined,host),8);
  compare(source,'custom-instanceof-trap',undefined,host);
});

test('host destructuring getter can inspect caller despite no MemberExpression',()=>{
  const getter=/** @type {()=>number} */ (vm.runInNewContext(
    '(function getter(){const caller=getter.caller;'+
    'return caller&&caller.toString().includes("secretField")?7:8;})'
  ));
  const host=Object.defineProperty({},'value',{get:getter});
  const source=[
    'function privateFn(){',
    '  const secret={secretField:1};',
    '  const {value}=host;',
    '  return value+secret.secretField;',
    '}',
    'module.exports=privateFn();'
  ].join('\n');
  assert.equal(execute(source,undefined,host),8);
  compare(source,'destructuring-getter',undefined,host);
});
