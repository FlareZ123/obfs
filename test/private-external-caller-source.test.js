'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * The external host establishes a sloppy caller inspector before loading the
 * module. This callback itself is outside the compiler's supplied source.
 * @param {string} code
 * @returns {string}
 */
function observe(code) {
  const exported={};
  const sandbox={module:{exports:exported},exports:exported};
  const preload='function external(){return String(external.caller).includes("localSecret");}\n';
  vm.runInNewContext(preload+code,sandbox,{timeout:2000});
  return JSON.stringify(sandbox.module.exports);
}

/**
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'external-host-caller-source',
    identifiers:true,strings:false,properties:false
  }).files[0];
}

test('external sloppy caller inspector sees private direct-called worker source',()=>{
  const source=[
    'function worker(){const localSecret=17;',
    'return [external(),localSecret];}',
    'module.exports=worker();'
  ].join('\n');
  const output=compile(source);
  assert.equal(observe(source),'[true,17]');
  assert.equal(observe(output.code),observe(source),output.code);
});

test('ordinary direct-call worker retains meaningful private identifier yield',()=>{
  const source=[
    'function worker(){const localSecret=17;',
    'return [1,localSecret];}',
    'module.exports=worker();'
  ].join('\n');
  const output=compile(source);
  assert.equal(observe(output.code),'[1,17]',output.code);
  assert.ok(output.metrics.bindings>0,output.code);
});
