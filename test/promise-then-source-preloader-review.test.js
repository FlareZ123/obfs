'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A host can replace an ambient method before executing the produced file.
 * Its wrapper records the exact source of the first Promise continuation
 * without changing the continuation's eventual value.
 * @param {string} source
 * @returns {Promise<{value:number,callbackSource:string}>}
 */
async function execute(source) {
  /** @type {{module:{exports:unknown},captured?:string}} */
  const sandbox={module:{exports:undefined}};
  vm.runInNewContext([
    'const nativeThen=Promise.prototype.then;',
    'Promise.prototype.then=function(first,...rest){',
    '  if(typeof first==="function" && globalThis.captured===undefined)',
    '    globalThis.captured=Function.prototype.toString.call(first);',
    '  return Reflect.apply(nativeThen,this,[first,...rest]);',
    '};',
    source
  ].join('\n'),sandbox,{timeout:3000});
  const value=await /** @type {Promise<number>} */ (sandbox.module.exports);
  return {value,callbackSource:sandbox.captured??''};
}

const source=[
  'const owner={secretField:17};',
  'const independent={otherField:4};',
  'const independentValue=independent.otherField;',
  'module.exports=Promise.resolve(5).then(()=>owner.secretField+independentValue);'
].join('\n');

test('ambient Promise.prototype.then callback source is externally observable',async()=>{
  const original=await execute(source);
  assert.equal(original.value,21);
  assert.match(original.callbackSource,/secretField/u);
  assert.match(original.callbackSource,/independentValue/u);
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' preloaded Promise continuation keeps exact source spelling',async()=>{
    const native=await execute(source);
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'preloaded-promise-source-'+mode,
      closedWorld:true,strings:false,properties:true,identifiers:false
    });
    const transformed=await execute(String(result.files[0].code));
    assert.equal(transformed.value,native.value,
      'Promise callback must preserve its ordinary result');
    assert.equal(transformed.callbackSource,native.callbackSource,
      'A host-installed then observer must see native callable source');
  });
}

test('same fixture has an unrelated positive private-own-key candidate',()=>{
  const minimal=[
    'const independent={otherField:4};',
    'module.exports=independent.otherField;'
  ].join('\n');
  const compiled=obfuscateFiles([{path:'positive.cjs',sourceType:'commonjs',code:minimal}],{
    mode:'sno',seed:'preloaded-promise-positive',strings:false,
    properties:true,identifiers:false
  });
  assert.equal(compiled.files[0].metrics.properties,1,
    'This proof must not be satisfied by a no-transform compiler');
});
