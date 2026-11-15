'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {recoverIdentifiersWithSeed,substituteRecoveredNames}=
  require('../sims/sco-seed-dictionary');

/** @param {string} source @returns {unknown} */
function run(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

test('published SCO seed permits offline dictionary recovery of identifier names',()=>{
  const original=[
    'const confidentialUserScore=19;',
    'const logicalOutput=confidentialUserScore+3;',
    'module.exports=logicalOutput;'
  ].join('\n');
  const seed='previously-public-sco-request-seed';
  const output=obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:original}
  ],{mode:'sco',seed,properties:false,strings:false});
  const transformed=/** @type {string} */ (output.files[0].code);
  assert.ok(output.files[0].metrics.bindings>=2,transformed);
  assert.ok(!transformed.includes('confidentialUserScore'),transformed);
  assert.ok(!transformed.includes('logicalOutput'),transformed);
  const recovered=recoverIdentifiersWithSeed(transformed,{
    seed,filePath:'entry.cjs',sourceType:'commonjs',
    dictionary:['unusedGuess','confidentialUserScore','logicalOutput'],
    maxSourceOffset:original.length
  });
  assert.deepEqual(new Set([...recovered.values()].map(item=>item.name)),
    new Set(['confidentialUserScore','logicalOutput']));
  const reconstructed=substituteRecoveredNames(transformed,recovered,'commonjs');
  assert.ok(reconstructed.includes('const confidentialUserScore=19;'),reconstructed);
  assert.ok(reconstructed.includes('const logicalOutput=confidentialUserScore+3;'),reconstructed);
  assert.equal(run(reconstructed),run(original));
});

test('bounded dictionary cannot assert success when it lacks the original names',()=>{
  const original='const privateDataValue=17;module.exports=privateDataValue;';
  const transformed=/** @type {string} */ (obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:original}
  ],{mode:'sco',seed:'known-seed',properties:false,strings:false}).files[0].code);
  const recovered=recoverIdentifiersWithSeed(transformed,{
    seed:'known-seed',filePath:'entry.cjs',sourceType:'commonjs',
    dictionary:['wrongGuess'],maxSourceOffset:original.length
  });
  assert.equal(recovered.size,0);
});

test('dictionary attack validates source inputs and limits offset search',()=>{
  assert.throws(()=>recoverIdentifiersWithSeed('const a=1;',{
    seed:'seed',filePath:'entry.cjs',dictionary:['a'],maxSourceOffset:65537
  }),/bounded offset/);
  assert.throws(()=>recoverIdentifiersWithSeed('const a=1;',{
    seed:'seed',filePath:'entry.cjs',dictionary:['bad-name'],maxSourceOffset:100
  }),/ASCII identifier names/);
});
