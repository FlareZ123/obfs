'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const source=[
  'function hidden(){',
  '  const owner={secretField:7};',
  '  getExternal();',
  '  return owner.secretField;',
  '}',
  'function publicReader(){return hidden();}',
  'module.exports=publicReader;'
].join('\n');

/**
 * Execute a module with a host-supplied sloppy callback that captures its caller.
 * @param {string} code
 * @returns {{value:unknown,source:string|null}}
 */
function observeHiddenCaller(code){
  const context={module:{exports:null},state:{source:null}};
  vm.runInNewContext(
    'getExternal=function(){state.source=Function.prototype.toString.call(arguments.callee.caller);};',
    context,{timeout:1000}
  );
  vm.runInNewContext(code,context,{timeout:1000});
  const value=context.module.exports();
  return {value,source:context.state.source};
}

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' must preserve private helper source observed through ambient host caller',()=>{
    const native=observeHiddenCaller(source);
    assert.equal(native.value,7,'original helper returns the owner field');
    assert.match(String(native.source),/owner\.secretField/u,
      'host callback must capture the original hidden function source');
    const result=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'ambient-host-caller-source/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const output=result.files.find(file=>file.path==='entry.cjs');
    assert.ok(output,'transformed CommonJS entry must remain present');
    const emitted=observeHiddenCaller(String(output.code));
    assert.equal(emitted.value,native.value,
      mode+': transformed helper must preserve runtime result');
    assert.equal(emitted.source,native.source,
      mode+': hidden helper source must remain identical when captured by host callback');
    assert.equal(output.metrics.properties,0,
      mode+': owner field is observable through ambient host caller and must not be renamed');
  });
}
