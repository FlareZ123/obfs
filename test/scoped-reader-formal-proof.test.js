'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/**
 * @param {string} code
 * @returns {unknown}
 */
function runCommonJs(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/**
 * @param {string} source
 * @param {string} seed
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,seed){
  return obfuscateFiles([{
    path:'entry.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'coo',
    seed,
    strings:false,
    identifiers:false
  }).files[0];
}

test('independent declaration readers may reuse a formal spelling',()=>{
  const source=[
    'const root={secretAlpha:23,secretBeta:7};',
    'function first(owner){return owner.secretAlpha;}',
    'function second(owner){return owner.secretBeta;}',
    'module.exports=[first(root),second(root),first(root)+second(root)];'
  ].join('\n');
  const result=compile(source,'scoped-reader-declarations');
  assert.equal(result.metrics.objects,1);
  assert.equal(result.metrics.properties,2);
  assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
    JSON.stringify(runCommonJs(source)));
  assert.doesNotMatch(String(result.code),/secretAlpha|secretBeta/u);
});

test('independent immutable expression readers may reuse a formal spelling',()=>{
  const source=[
    'const root={secretAlpha:31,secretBeta:11};',
    'const first=(owner)=>owner.secretAlpha;',
    'const second=function(owner){return owner.secretBeta;};',
    'module.exports=[first(root),second(root),first(root)-second(root)];'
  ].join('\n');
  const result=compile(source,'scoped-reader-expressions');
  assert.equal(result.metrics.objects,1);
  assert.equal(result.metrics.properties,2);
  assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
    JSON.stringify(runCommonJs(source)));
  assert.doesNotMatch(String(result.code),/secretAlpha|secretBeta/u);
});

test('same-spelled reader still declines a foreign-owner call',()=>{
  const source=[
    'const root={secretAlpha:23};',
    'const external={secretAlpha:99};',
    'function first(owner){return owner.secretAlpha;}',
    'function second(owner){return owner.secretAlpha;}',
    'module.exports=[first(root),second(root),second(external)];'
  ].join('\n');
  const result=compile(source,'scoped-reader-foreign-owner');
  assert.equal(result.metrics.objects,0);
  assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
    JSON.stringify(runCommonJs(source)));
});

test('same-spelled reader still declines callable escape to an opaque callback',()=>{
  const source=[
    'const root={secretAlpha:23};',
    'function first(owner){return owner.secretAlpha;}',
    'function second(owner){return owner.secretAlpha;}',
    'function opaque(callback){return callback({secretAlpha:99});}',
    'module.exports=[first(root),second(root),opaque(second)];'
  ].join('\n');
  const result=compile(source,'scoped-reader-escape');
  assert.equal(result.metrics.objects,0);
  assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
    JSON.stringify(runCommonJs(source)));
});

test('nested shadowing remains outside the exact-reader proof',()=>{
  const source=[
    'const root={secretAlpha:23};',
    'function first(owner){',
    '  function inner(owner){return owner.secretAlpha;}',
    '  return owner.secretAlpha+inner({secretAlpha:5});',
    '}',
    'function second(owner){return owner.secretAlpha;}',
    'module.exports=[first(root),second(root)];'
  ].join('\n');
  const result=compile(source,'scoped-reader-shadowing');
  assert.equal(result.metrics.objects,0);
  assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
    JSON.stringify(runCommonJs(source)));
});
