'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute the source with a host callback outside the VM realm. The callback
 * captures a local function, then the host observes its source independently.
 * @param {string} source
 * @returns {{value:unknown,source:string}}
 */
function observeHostCallback(source) {
  /** @type {Function|null} */
  let captured=null;
  const context={
    module:{exports:null},
    external(value){captured=value;}
  };
  vm.runInNewContext(source,context,{timeout:1000});
  assert.equal(typeof captured,'function',
    'the external host must receive the local callback');
  const fn=/** @type {()=>unknown} */(captured);
  return {
    value:fn(),
    source:Function.prototype.toString.call(fn)
  };
}

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' preserves a private owner key when its reader escapes to a host callback',()=>{
    const source=
      'const privateOwner={secretField:17,otherField:5};'+
      'function privateReader(){return privateOwner.secretField;}'+
      'external(privateReader);';
    const native=observeHostCallback(source);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'private-owner-host-callback-source-boundary',
      identifiers:false,strings:false,properties:true
    });
    assert.equal(output.files[0].metrics.properties,0,
      'a host-held callable may expose its original source spelling');
    assert.deepEqual(observeHostCallback(output.files[0].code),native,
      'the host must observe identical callback behavior and Function#toString bytes');
    assert.match(native.source,/privateOwner\.secretField/);
  });
}
