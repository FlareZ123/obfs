'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {test}=require('node:test');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');
const {buildSample}=require('../examples/factory-iife/build-sample.cjs');

/** @param {string} code @returns {number} */
function run(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return /** @type {number} */ (context.module.exports);
}

test('real generated IIFE sample preserves native result and is statically neutralized',async()=>{
  const after=await buildSample(true);
  const before=await fs.readFile(path.join(__dirname,'../examples/factory-iife/before.cjs'),'utf8');
  assert.equal(run(before),22);
  assert.equal(run(after),22);
  assert.doesNotMatch(after,/secretField|otherField/u);
  const attack=normalizeDistributedFiles([{path:'factory.cjs',sourceType:'commonjs',code:after}]);
  assert.equal(attack.properties,2);
  assert.equal(run(attack.files[0].code),22);
  assert.doesNotMatch(attack.files[0].code,/_p[a-f0-9]{10}/u);
});
