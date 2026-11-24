'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  const receiver={caller:null};
  const getExternal=Function('receiver',
    'return function externalCaller(){receiver.caller=arguments.callee.caller.caller;}'
  )(receiver);
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{timeout:2500});
  const exported=/** @type {()=>unknown} */(context.module.exports);
  const value=exported();
  const caller=receiver.caller;
  assert.equal(typeof caller,'function',
    'The host callback must capture the second active caller frame');
  return {value,source:Function.prototype.toString.call(caller)};
}

const source='function invokeExternal(){getExternal();}'+
  'function hidden(){'+
  'const owner={secretField:41,otherField:2};'+
  'invokeExternal();'+
  'return owner.secretField+owner.otherField;'+
  '}'+
  'function publicReader(){return hidden();}'+
  'module.exports=publicReader;';

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' transitive host callback observes a direct-call-only ancestor helper source',()=>{
    const before=observe(source);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'transitive-external-host-caller-private-property-source-witness',
      identifiers:false,strings:false,properties:true
    }).files[0];
    const after=observe(String(output.code));
    assert.equal(after.value,before.value,
      'The runtime result must remain unchanged');
    assert.equal(after.source,before.source,
      'A host callback can inspect its entire active sloppy caller chain');
  });
}
