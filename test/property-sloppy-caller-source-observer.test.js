'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {{value:unknown,source:string}} */
function observe(code){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2500});
  const out=/** @type {{run:()=>unknown,getCaptured:()=>unknown}} */(context.module.exports);
  const value=out.run();
  const captured=out.getCaptured();
  assert.equal(typeof captured,'function',
    'The legacy sloppy-caller accessor must return the running helper');
  return {value,source:Function.prototype.toString.call(captured)};
}

/**
 * A non-exported helper used only as a direct call can still be observed
 * indirectly through a nested sloppy function's legacy .caller getter.
 * No same-file Function#toString exists; it is invoked only by an external
 * consumer of the public CJS module.
 */
for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' private direct-call helper is observable through sloppy caller capture',()=>{
    const source='const owner={secretField:41,otherField:2};'+
      'let captured=null;'+
      'function capture(){captured=capture.caller;}'+
      'function privateReader(){capture();return owner.secretField+owner.otherField;}'+
      'module.exports={run(){return privateReader();},getCaptured(){return captured;}};';
    const before=observe(source);
    const out=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'sloppy-caller-private-source-leak',
      identifiers:false,strings:false,properties:true
    }).files[0];
    const after=observe(String(out.code));
    assert.deepEqual(after,before,
      'An external caller can observe changed privateReader source via getCaptured');
    assert.equal(out.metrics.properties,0,
      'A helper with .caller exposure cannot retain renamed source properties');
  });
}

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' plain data property named caller preserves private rewrite yield',()=>{
    const source='const owner={secretField:41};'+
      'const metadata={caller:2};'+
      'function local(){return owner.secretField;}'+
      'module.exports=local()+metadata.caller;';
    const out=obfuscateFiles([{
      path:'value.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'plain-data-caller-precision',
      identifiers:false,strings:false,properties:true
    }).files[0];
    assert.ok(out.metrics.properties>=1,String(out.code));
    /** @param {string} code @returns {unknown} */
    function value(code) {
      /** @type {{module:{exports:unknown}}} */
      const realm={module:{exports:null}};
      vm.runInNewContext(code,realm,{timeout:2000});
      return realm.module.exports;
    }
    assert.equal(value(String(out.code)),value(source));
  });
}
