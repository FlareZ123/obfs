'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Evaluate in a realm whose ordinary Promise continuation method has been
 * substituted by its host before loading the compiled application.
 * @param {string} code
 * @returns {string}
 */
function observe(code) {
  const original={};
  const sandbox={module:{exports:original},exports:original};
  const patch='Promise.prototype.then=function(callback){'+
    'return [String(callback).includes("localSecret"),callback()];};\n';
  vm.runInNewContext(patch+code,sandbox,{timeout:2000});
  return JSON.stringify(sandbox.module.exports);
}

/**
 * Build a public-source-preserving CommonJS file with identifiers enabled.
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code) {
  return obfuscateFiles([{path:'entry.cjs',code,sourceType:'commonjs'}],{
    mode:'sno',seed:'promise-then-callback-source-peer',
    properties:false,strings:false,identifiers:true,
    preservePublicCallableSource:true
  }).files[0];
}

const source=[
  'module.exports=Promise.resolve().then(()=>{',
  'const localSecret=17;return localSecret;',
  '});'
].join('\n');

test('host-replaced Promise.then sees original callback source spelling',()=>{
  const result=compile(source);
  assert.equal(observe(source),JSON.stringify([true,17]));
  assert.equal(observe(result.code),observe(source),result.code);
});

test('native-looking Promise continuation remains an identifier-yield target',()=>{
  const result=compile(source);
  assert.ok(result.metrics.bindings>0,result.code);
});
