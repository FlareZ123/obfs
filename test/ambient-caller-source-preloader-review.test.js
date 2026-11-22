'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A sloppy host wrapper can inspect its direct caller through legacy
 * Function#caller. The original Array.isArray behavior remains unchanged.
 * @param {string} source
 * @returns {{value:number,source:string}}
 */
function execute(source) {
  /** @type {{module:{exports:unknown},observed?:string}} */
  const sandbox={module:{exports:undefined}};
  vm.runInNewContext([
    'const nativeIsArray=Array.isArray;',
    'Array.isArray=function observedIsArray(value){',
    '  const caller=arguments.callee.caller;',
    '  if(caller&&caller.name==="privateWorker")',
    '    globalThis.observed=Function.prototype.toString.call(caller);',
    '  return nativeIsArray(value);',
    '};',
    source
  ].join('\n'),sandbox,{timeout:3000});
  return {value:/** @type {number} */ (sandbox.module.exports),source:sandbox.observed??''};
}

const source=[
  'const unrelated={otherField:3};',
  'const bonus=unrelated.otherField;',
  'function privateWorker(){',
  '  const owner={secretField:17};',
  '  const value=owner.secretField;',
  '  const yes=Array.isArray([1,2]);',
  '  return value+bonus+(yes?1:0);',
  '}',
  'module.exports=privateWorker();'
].join('\n');

test('sloppy ambient host call can observe a lexical private worker source',()=>{
  const native=execute(source);
  assert.equal(native.value,21);
  assert.match(native.source,/function privateWorker\(\)/u);
  assert.match(native.source,/secretField/u);
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' keeps source readable through host native caller reflection',()=>{
    const native=execute(source);
    const output=obfuscateFiles([{path:'worker.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'ambient-caller-host-source-'+mode,
      closedWorld:true,properties:true,identifiers:false,strings:false
    }).files[0];
    const compiled=execute(String(output.code));
    assert.equal(compiled.value,native.value);
    console.log('AMBIENT_CALLER_SOURCE '+JSON.stringify({
      mode,properties:output.metrics.properties,
      expected:native.source,actual:compiled.source
    }));
    assert.equal(compiled.source,native.source,
      'A host wrapper may stringify its sloppy direct caller during a primitive API call');
  });
}
