'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'let capturedCaller=null;',
    'function spy(){',
    " const key=['cal','ler'].join('');",
    ' capturedCaller=Object.getOwnPropertyDescriptor(spy,key).value;',
    '}',
    'function privateCaller(){',
    ' const marker="DYNAMIC_DESCRIPTOR_CALLER_SOURCE_MARKER_0123456789_ABCDEF";',
    ' spy();',
    ' return marker.length;',
    '}',
    'const value=privateCaller();',
    'module.exports=[value,capturedCaller];'
  ].join('\n');
}

/**
 * Fetch original function source through the descriptor's data value,
 * with no member read of the name caller and no toString in source.
 * @param {string} code
 * @returns {[number,string]}
 */
function observe(code){
  /** @type {{module:{exports:unknown}}} */
  const state={module:{exports:null}};
  vm.runInNewContext(code,state,{filename:'dynamic-descriptor.cjs',timeout:1500});
  const answer=/** @type {[number,Function]} */(state.module.exports);
  assert.equal(typeof answer[0],'number');
  assert.equal(typeof answer[1],'function');
  return [answer[0],String(answer[1])];
}

test('computed descriptor of sloppy Function#caller exposes direct-only source',()=>{
  const input=fixture();
  const native=observe(input);
  assert.match(native[1],/DYNAMIC_DESCRIPTOR_CALLER_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:input}];
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-dynamic-descriptor-caller',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  }).files[0];
  const emitted=observe(String(output.code));
  process.stdout.write('DESCRIPTOR_CALLER_SOURCE_PROBE '+JSON.stringify({
    native,emitted,literals:output.metrics.literals,bindings:output.metrics.bindings,
    changed:String(output.code)!==input
  })+'\n');
  assert.deepEqual(emitted,native,'Legacy caller descriptor must preserve source');
});
