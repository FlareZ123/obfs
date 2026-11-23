'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {'coo'|'sno'} mode
 * @param {'module'|'commonjs'} sourceType
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,sourceType,code) {
  return obfuscateFiles([{path:sourceType==='module'?'entry.mjs':'entry.cjs',
    sourceType,code}],{
    mode,seed:'private-iife-arrow-source-boundary',
    properties:true,identifiers:false,strings:false
  }).files[0];
}

/** @param {string} code @returns {unknown} */
function evaluateCommonJS(code) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return context.module.exports;
}

/** @param {string} source @returns {Promise<unknown>} */
async function evaluateModule(source) {
  const url='data:text/javascript;base64,'+
    Buffer.from(source,'utf8').toString('base64');
  const namespace=await import(url);
  return namespace.value;
}

for(const mode of /** @type {const} */ (['coo','sno'])) {
  test(mode+' immediately invoked arrow body is private when only scalar escapes',()=>{
    const original='const owner={privateField:19,otherPrivate:11};'+
      'module.exports=(()=>owner.privateField+owner.otherPrivate)();';
    const out=compile(mode,'commonjs',original);
    assert.equal(out.metrics.properties,2,String(out.code));
    assert.equal(evaluateCommonJS(String(out.code)),evaluateCommonJS(original));
    assert.doesNotMatch(String(out.code),/privateField|otherPrivate/u);
  });

  test(mode+' ESM scalar export preserves exact private inline arrow field rewrites',async()=>{
    const original='const owner={privateField:19,otherPrivate:11};'+
      'export const value=(()=>owner.privateField+owner.otherPrivate)();';
    const out=compile(mode,'module',original);
    assert.equal(out.metrics.properties,2,String(out.code));
    assert.equal(await evaluateModule(String(out.code)),await evaluateModule(original));
    assert.doesNotMatch(String(out.code),/privateField|otherPrivate/u);
  });

  test(mode+' inline arrow inside publicly exposed callable remains unrenamed',()=>{
    const original='const owner={privateField:19};'+
      'module.exports=function publicReader(){return (()=>owner.privateField)();};';
    const out=compile(mode,'commonjs',original);
    assert.equal(out.metrics.properties,0,String(out.code));
    const originalFn=/** @type {()=>unknown} */(evaluateCommonJS(original));
    const emittedFn=/** @type {()=>unknown} */(evaluateCommonJS(String(out.code)));
    assert.equal(originalFn(),emittedFn());
    assert.equal(Function.prototype.toString.call(originalFn),
      Function.prototype.toString.call(emittedFn));
  });

  test(mode+' exported inline arrow value remains source-observable and unrenamed',()=>{
    const original='const owner={privateField:19};'+
      'module.exports=()=>owner.privateField;';
    const out=compile(mode,'commonjs',original);
    assert.equal(out.metrics.properties,0,String(out.code));
    const originalFn=/** @type {()=>unknown} */(evaluateCommonJS(original));
    const emittedFn=/** @type {()=>unknown} */(evaluateCommonJS(String(out.code)));
    assert.equal(originalFn(),emittedFn());
    assert.equal(Function.prototype.toString.call(originalFn),
      Function.prototype.toString.call(emittedFn));
  });
}
