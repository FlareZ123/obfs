'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Compare strict source-observability parity in a sloppy CommonJS script.
 * @param {string} code
 * @returns {unknown}
 */
function observe(code) {
  const exports={};
  const sandbox={module:{exports},exports};
  vm.runInNewContext(code,sandbox,{timeout:1500});
  return sandbox.module.exports;
}

/**
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code) {
  return obfuscateFiles([{path:'entry.cjs',code}],{
    mode:'sno',seed:'private-iife-source-parity',
    preservePublicCallableSource:true,
    properties:false,strings:false,identifiers:true
  }).files[0];
}

test('self source in directly invoked sloppy IIFE keeps a named local spelling',()=>{
  const source=[
    'module.exports=(function(){',
    'const localSecret=17;',
    'return String(arguments.callee).includes("localSecret");',
    '})();'
  ].join('\n');
  const output=compile(source);
  assert.equal(observe(source),true);
  assert.equal(observe(output.code),observe(source),output.code);
});

test('source-unobserved direct IIFE retains local identifier rename yield',()=>{
  const source='module.exports=(function(){const localSecret=17;return localSecret;})();';
  const output=compile(source);
  assert.equal(observe(output.code),17,output.code);
  assert.ok(output.metrics.bindings>0,output.code);
});
