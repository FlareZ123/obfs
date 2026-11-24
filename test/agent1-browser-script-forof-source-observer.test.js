'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a classic script with a host-supplied sloppy iterable and capture
 * the active hidden() function through the external callback.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  /** @type {{captured:unknown}} */
  const observation={captured:null};
  const external=Function('observation',
    'return function external(){observation.captured=arguments.callee.caller.caller;}'
  )(observation);
  const iterable=Function('external',
    'return {'+
      '[Symbol.iterator]:function iterator(){return this;},'+
      'next:function next(){external();return {done:true};}'+
    '};'
  )(external);
  /** @type {{publicReader:unknown,external:unknown,iterable:unknown}} */
  const context={publicReader:null,external,iterable};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.publicReader,'function');
  const reader=/** @type {(value:unknown)=>unknown} */(context.publicReader);
  const value=reader(iterable);
  assert.equal(typeof observation.captured,'function');
  return {value,source:Function.prototype.toString.call(observation.captured)};
}

/**
 * @param {'coo'|'sno'} mode
 * @returns {string}
 */
function compile(mode) {
  const result=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
    mode,seed:'agent1-browser-script-forof-source-observer',
    identifiers:true,strings:false,properties:true
  });
  assert.equal(result.files.length,1);
  return result.files[0].code;
}

const source=
  '(function(){'+
    'const owner={secretField:1};'+
    'const other={unrelatedField:2};'+
    'function hidden(iterable){for(const value of iterable){}return owner.secretField;}'+
    'function plain(){const safeLocal=2;return other.unrelatedField+safeLocal;}'+
    'function publicReader(iterable){return hidden(iterable)+plain();}'+
    'globalThis.publicReader=publicReader;'+
  '})();';

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' classic-script pipeline currently leaves this fixture unchanged',()=>{
    const before=observe(source);
    assert.equal(before.value,5);
    const code=compile(mode);
    const after=observe(code);
    assert.equal(after.value,before.value);
    assert.equal(code,source,
      'The current classic-script pipeline produces no transform yield for this fixture: '+code);
    assert.deepEqual(after,before,
      'A host IteratorNext callback can capture hidden() in classic-script '+mode+': '+
      JSON.stringify({before,after,code}));
  });
}
