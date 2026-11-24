'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  /** @type {{captured:unknown}} */
  const observation={captured:null};
  const external=Function('observation',
    'return function external(){observation.captured=arguments.callee.caller.caller;}'
  )(observation);
  const has=/** @type {ProxyHandler<object>['has']} */(Function('external',
    'return function has(target,key){if(key===\'x\'){external();return true;}return false;}'
  )(external));
  const value=new Proxy({}, {has});
  /** @type {{module:{exports:unknown},value:unknown}} */
  const context={module:{exports:null},value};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  const reader=/** @type {(input:unknown)=>unknown} */(context.module.exports);
  const result=reader(value);
  assert.equal(typeof observation.captured,'function');
  return {value:result,source:Function.prototype.toString.call(observation.captured)};
}

/**
 * @param {'coo'|'sno'} mode
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,code) {
  const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'agent1-with-active-frame-positive-yield',
    identifiers:false,strings:false,properties:true
  });
  return result.files[0];
}

const source=
  'const owner={secretField:1};'+
  'const other={unrelatedField:2};'+
  'function hidden(value){with(value){x;}return owner.secretField;}'+
  'function plain(){return other.unrelatedField;}'+
  'function publicReader(value){return hidden(value)+plain();}'+
  'module.exports=publicReader;';

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' With source-observer guard preserves source by refusing file-wide property yield',()=>{
    const before=observe(source);
    const output=compile(mode,source);
    const after=observe(String(output.code));
    assert.equal(output.metrics.properties,0,
      'The With/Proxy.has guard currently refuses all property rewrites: '+
      JSON.stringify({metrics:output.metrics,code:output.code}));
    assert.ok(String(output.code).includes('unrelatedField'),
      'The unrelated plain() property remains unchanged under the file-wide veto');
    assert.deepEqual(after,before,
      'The With/Proxy.has callback must preserve hidden() source');
  });
}
