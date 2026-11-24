'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The host callback is deliberately outside the source graph. It is sloppy
 * and reads its caller through the legacy caller accessor.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  const receiver={caller:null};
  const getExternal=Function('receiver',
    'return function externalCaller(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  /** @type {{module:{exports:unknown},getExternal:()=>void}} */
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{timeout:2500});
  const exported=/** @type {()=>unknown} */(context.module.exports);
  const value=exported();
  const caller=receiver.caller;
  assert.equal(typeof caller,'function',
    'The external sloppy callback must capture the running private helper');
  return {value,source:Function.prototype.toString.call(caller)};
}

const source='function hidden(){'+
  'const owner={secretField:41,otherField:2};'+
  'getExternal();'+
  'return owner.secretField+owner.otherField;'+
  '}'+
  'function publicReader(){return hidden();}'+
  'module.exports=publicReader;';

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' direct-call private helper remains source-exact under external sloppy caller observation',()=>{
    const before=observe(source);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'external-host-caller-current-main-witness',
      identifiers:false,strings:false,properties:true
    }).files[0];
    const after=observe(String(output.code));
    assert.equal(after.value,before.value,
      'The runtime result must remain unchanged');
    assert.equal(after.source,before.source,
      'An external host callback can read the private helper source via arguments.callee.caller');
    assert.equal(output.metrics.properties,0,
      'A source-observable helper must not receive local property rewrites');
  });
}
