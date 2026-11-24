'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Invoke an exported reader with a host-supplied sloppy iterable. Its next()
 * callback captures the active hidden() function object without any explicit
 * call or source-reader syntax in hidden() itself.
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
  /** @type {{module:{exports:unknown},iterable:unknown}} */
  const context={module:{exports:null},iterable};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  const reader=/** @type {(value:unknown)=>unknown} */(context.module.exports);
  const value=reader(iterable);
  assert.equal(typeof observation.captured,'function',
    'The sloppy external callback must capture hidden() through IteratorNext');
  return {value,source:Function.prototype.toString.call(observation.captured)};
}

/**
 * @param {'coo'|'sno'} mode
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,code) {
  const result=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code
  }],{
    mode,seed:'agent1-forof-active-frame-source-observer',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(result.files.length,1);
  return result.files[0];
}

const source=
  'const owner={secretField:1};'+
  'const other={unrelatedField:2};'+
  'function hidden(iterable){'+
    'for(const value of iterable){}'+
    'return owner.secretField;'+
  '}'+
  'function plain(){return other.unrelatedField;}'+
  'function publicReader(iterable){return hidden(iterable)+plain();}'+
  'module.exports=publicReader;';

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' ForOf iterator callback preserves hidden callable source while retaining unrelated yield',()=>{
    const before=observe(source);
    assert.equal(before.value,3);
    const output=compile(mode,source);
    const after=observe(String(output.code));
    assert.ok(output.metrics.properties>=1,
      'The unrelated private property should retain nonzero rewrite yield: '+
      JSON.stringify({metrics:output.metrics,code:output.code}));
    assert.ok(!String(output.code).includes('unrelatedField'),
      'The unrelated plain() owner key should still be renamed');
    assert.deepEqual(after,before,
      'A caller-controlled IteratorNext callback can read hidden() source through the active frame: '+
      JSON.stringify({metrics:output.metrics,code:output.code,before,after}));
  });
}
