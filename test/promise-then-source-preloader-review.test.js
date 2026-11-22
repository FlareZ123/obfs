'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {'then'|'catch'|'finally'} ContinuationMethod */

/**
 * A host can replace an ambient Promise method before executing an emitted
 * module, recording exact callback source without changing its result.
 * @param {string} source
 * @param {ContinuationMethod} method
 * @returns {Promise<{value:number,callbackSource:string}>}
 */
async function execute(source,method) {
  /** @type {{module:{exports:unknown},captured?:string}} */
  const sandbox={module:{exports:undefined}};
  vm.runInNewContext([
    'const native=Promise.prototype['+JSON.stringify(method)+'];',
    'Promise.prototype['+JSON.stringify(method)+']=function(first,...rest){',
    '  if(typeof first==="function" && globalThis.captured===undefined)',
    '    globalThis.captured=Function.prototype.toString.call(first);',
    '  return Reflect.apply(native,this,[first,...rest]);',
    '};',
    source
  ].join('\n'),sandbox,{timeout:3000});
  const value=await /** @type {Promise<number>} */ (sandbox.module.exports);
  return {value,callbackSource:sandbox.captured??''};
}

/**
 * A private owner is read inside a Promise continuation whose exact source
 * can be examined by an ambient host. A separate private owner is read
 * outside it, so correct conservative refusal retains positive yield.
 * @param {ContinuationMethod} method
 * @returns {string}
 */
function sourceFor(method) {
  const callback='()=>owner.secretField+independentValue';
  const expression=method==='then'
    ? 'Promise.resolve(5).then('+callback+')'
    : method==='catch'
      ? 'Promise.resolve(5).then(()=>{throw Error("test")}).catch('+callback+')'
      : 'Promise.resolve(5).finally('+callback+')';
  return [
    'const owner={secretField:17};',
    'const independent={otherField:4};',
    'const independentValue=independent.otherField;',
    'module.exports='+expression+';'
  ].join('\n');
}

for(const method of /** @type {const} */ (['then','catch','finally'])) {
  test('ambient Promise.prototype.'+method+' observes callback source',async()=>{
    const native=await execute(sourceFor(method),method);
    assert.equal(native.value,method==='finally'?5:21);
    assert.equal(native.callbackSource,'()=>owner.secretField+independentValue');
  });

  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    test(mode+' preloaded '+method+' callback keeps source and positive private yield',async()=>{
      const source=sourceFor(method);
      const native=await execute(source,method);
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'preloaded-promise-'+method+'-'+mode,
        closedWorld:true,strings:false,properties:true,identifiers:false
      });
      assert.equal(result.files[0].metrics.properties,1,
        'One unrelated private owner must remain genuinely renameable');
      const transformed=await execute(String(result.files[0].code),method);
      assert.equal(transformed.value,native.value);
      assert.equal(transformed.callbackSource,native.callbackSource,
        'A host-installed continuation observer must see original callable source');
    });
  }
}

test('unrelated direct private owner remains renameable without Promise callbacks',()=>{
  const source=[
    'const independent={otherField:4};',
    'module.exports=independent.otherField;'
  ].join('\n');
  const compiled=obfuscateFiles([{path:'positive.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'preloaded-promise-positive',
    strings:false,properties:true,identifiers:false
  });
  assert.equal(compiled.files[0].metrics.properties,1);
});
