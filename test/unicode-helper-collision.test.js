'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function result(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

test('string decoder avoids names declared with Unicode escape spelling',()=>{
  const seed='escaped-helper-collision';
  const salt=createHash('sha256').update(seed+'/entry.cjs').digest('hex');
  const digest=createHash('sha256').update(salt+'strings').digest('hex');
  const predicted='_o'+digest.slice(0,12);
  const escaped='\\u005f'+predicted.slice(1);
  const source='const '+escaped+'=31;module.exports=['+escaped+',"unencoded-runtime-text"];';
  const transformed=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed,properties:false,identifiers:false
  }).files[0];
  assert.equal(result(transformed.code),result(source));
  assert.equal(transformed.metrics.literals,1);
  assert.ok(!transformed.code.includes('const '+predicted+'=['));
});
