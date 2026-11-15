'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/**
 * Execute with a same-named free variable supplied by the global environment.
 * @param {string} code
 * @param {string} name
 * @returns {string}
 */
function evaluate(code,name) {
  const context={module:{exports:null},[name]:99};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

test('identifier mangling cannot capture a Unicode-escaped free global',()=>{
  const seed='escaped-free-identifier';
  const salt=createHash('sha256').update(seed+'/entry.cjs').digest('hex');
  const predicted='_v'+createHash('sha256').update(salt+'/6/shortName').digest('hex').slice(0,12);
  const escaped='\\u005f'+predicted.slice(1);
  const code='const shortName=17;module.exports=[shortName,'+escaped+'];';
  const transformed=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed,properties:false,strings:false
  }).files[0];
  assert.equal(evaluate(transformed.code,predicted),evaluate(code,predicted));
  assert.equal(transformed.metrics.bindings,1);
  assert.ok(!transformed.code.includes('const '+predicted+'='));
});
