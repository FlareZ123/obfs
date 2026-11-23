'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @returns {{value:unknown,callableSource:string|null}}
 */
function execute(source){
  /** @type {{module:{exports:unknown}}} */
  const state={module:{exports:null}};
  vm.runInNewContext(source,state,{timeout:2000});
  const exported=state.module.exports;
  return {value:typeof exported==='function' ? exported() : exported,
    callableSource:typeof exported==='function' ?
      Function.prototype.toString.call(exported):null};
}

/** @param {string} source @param {'coo'|'sno'} mode */
function compile(source,mode){
  return obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode,seed:'direct-arrow-iife-privacy',
    identifiers:false,strings:false,properties:true
  }).files[0];
}

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' admits source-unobservable direct arrow IIFE and preserves native output',()=>{
    const source="'use strict';const owner={hiddenCount:41,secretDelta:2};"+
      'module.exports=(()=>owner.hiddenCount+owner.secretDelta)();';
    const out=compile(source,mode);
    assert.equal(out.metrics.properties,2,String(out.code));
    assert.deepEqual(execute(String(out.code)),execute(source));
  });
  test(mode+' preserves source-visible exported arrow even with direct-owner read',()=>{
    const source='const owner={hiddenCount:41,secretDelta:2};'+
      'module.exports=()=>owner.hiddenCount+owner.secretDelta;';
    const out=compile(source,mode);
    assert.equal(out.metrics.properties,0,String(out.code));
    assert.deepEqual(execute(String(out.code)),execute(source));
  });
  test(mode+' sloppy caller observer can recover an IIFE arrow source: must refuse',()=>{
    const source='const owner={hiddenCount:41,secretDelta:2};'+
      'function capture(){return capture.caller;}'+
      'module.exports=(()=>{const n=owner.hiddenCount+owner.secretDelta;return capture();})();';
    const out=compile(source,mode);
    assert.equal(out.metrics.properties,0,String(out.code));
    /** @param {string} code @returns {string} */
    function externalSource(code){
      /** @type {{module:{exports:unknown}}} */
      const ctx={module:{exports:null}};
      vm.runInNewContext(code,ctx,{timeout:1000});
      assert.equal(typeof ctx.module.exports,'function');
      return Function.prototype.toString.call(ctx.module.exports);
    }
    assert.equal(externalSource(String(out.code)),externalSource(source));
  });
  test(mode+' declines optional invoked arrow IIFE before source-proof upgrade',()=>{
    const source='const owner={hiddenCount:41,secretDelta:2};'+
      'module.exports=(()=>owner.hiddenCount+owner.secretDelta)?.();';
    const out=compile(source,mode);
    assert.equal(out.metrics.properties,0,String(out.code));
    assert.deepEqual(execute(String(out.code)),execute(source));
  });
}

test('ESM strict direct arrow IIFE retains two closed private field rewrites',async()=>{
  const source='const owner={hiddenCount:41,secretDelta:2};'+
    'export const answer=(()=>owner.hiddenCount+owner.secretDelta)();';
  const file=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'module-direct-arrow-iife',
    identifiers:false,strings:false,properties:true
  }).files[0];
  assert.equal(file.metrics.properties,2,String(file.code));
  /** @param {string} code @returns {Promise<unknown>} */
  async function observe(code){
    const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64');
    return (await import(url)).answer;
  }
  assert.equal(await observe(String(file.code)),await observe(source));
});
