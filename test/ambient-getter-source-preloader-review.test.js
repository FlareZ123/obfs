'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Property access invokes a host-supplied sloppy getter without an explicit
 * CallExpression in the source. The getter can inspect its direct caller.
 * @param {string} source
 * @returns {{value:number,source:string}}
 */
function execute(source) {
  /** @type {{module:{exports:unknown},observed?:string}} */
  const sandbox={module:{exports:undefined}};
  vm.runInNewContext([
    'Object.defineProperty(globalThis,"hostNumber",{',
    '  configurable:true,',
    '  get:function observedHostGetter(){',
    '    const caller=arguments.callee.caller;',
    '    if(caller&&caller.name==="privateWorker")',
    '      globalThis.observed=Function.prototype.toString.call(caller);',
    '    return 1;',
    '  }',
    '});',
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
  '  const externalNumber=globalThis.hostNumber;',
  '  return value+bonus+externalNumber;',
  '}',
  'module.exports=privateWorker();'
].join('\n');

test('ambient getter can inspect its sloppy direct caller without an explicit call',()=>{
  const native=execute(source);
  assert.equal(native.value,21);
  assert.match(native.source,/secretField/u);
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' source parity under host-provided getter caller reflection',()=>{
    const native=execute(source);
    const output=obfuscateFiles([{path:'worker.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'ambient-getter-source-'+mode,closedWorld:true,
      properties:true,identifiers:false,strings:false
    }).files[0];
    const transformed=execute(String(output.code));
    assert.equal(transformed.value,native.value);
    console.log('AMBIENT_GETTER_SOURCE '+JSON.stringify({
      mode,properties:output.metrics.properties,
      expected:native.source,actual:transformed.source
    }));
    assert.equal(transformed.source,native.source,
      'A host getter can stringify its sloppy caller during a plain MemberExpression');
  });
}
