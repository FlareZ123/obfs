'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parse}=require('../src/ast');
const {symbolizeLocalProperties}=require('../src/symbol-properties');
const {atomicWrite}=require('../src/atomic');

/**
 * Real filesystem-hosted modules are required because an independent
 * consumer may inspect native Function#toString after require/import.
 *
 * @param {(root:string)=>Promise<void>} run
 * @returns {Promise<void>}
 */
async function withTempDirectory(run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-symbol-public-'));
  try {await run(root);} finally {await fs.rm(root,{force:true,recursive:true});}
}

test('exported CommonJS callable reveals a forced private Symbol-key rewrite',async()=>{
  // Positive local transform proof is constructed before publishing calc.
  // Publishing the identical function then introduces a new host observer
  // that was absent from the closed-world proof input.
  const privateSource='const bag={pulse:7,mask:3};'+
    'function calc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}\n';
  const original=privateSource+'module.exports=calc;\n';
  const privateOut=symbolizeLocalProperties(privateSource,
    parse(privateSource,'commonjs'),{seed:'symbol-public-source-cjs'});
  assert.equal(privateOut.properties,2,'The genuinely private edit must be real');
  const publishedOut=symbolizeLocalProperties(original,
    parse(original,'commonjs'),{seed:'symbol-public-source-cjs'});
  assert.equal(publishedOut.properties,0,
    'The published callable source needs conservative refusal');

  await withTempDirectory(async(root)=>{
    const nativePath=path.join(root,'native.cjs');
    const forcedPath=path.join(root,'forced.cjs');
    await atomicWrite(nativePath,original);
    await atomicWrite(forcedPath,privateOut.code+'module.exports=calc;\n');
    const native=/** @type {(x:number)=>number} */(require(nativePath));
    const forced=/** @type {(x:number)=>number} */(require(forcedPath));
    const originalText=Function.prototype.toString.call(native);
    const forcedText=Function.prototype.toString.call(forced);
    assert.match(originalText,/bag\.pulse/u);
    assert.doesNotMatch(forcedText,/bag\.pulse/u);
    assert.notEqual(forcedText,originalText,
      'Independent CommonJS consumers see the changed function source');
    for(const input of [2,4,-3,13,0]) {
      assert.ok(Object.is(native(input),forced(input)));
    }
    console.log('SYMBOL_PUBLIC_SOURCE_WITNESS='+JSON.stringify({
      module:'commonjs',privateProperties:privateOut.properties,
      publishedProperties:publishedOut.properties,
      sourceIdentical:forcedText===originalText,
      behaviorEqual:true
    }));
  });
});

test('exported ESM callable reveals a forced private Symbol-key rewrite',async()=>{
  const body='const privateState={pulse:5,mask:3};'+
    'function touch(x){privateState.pulse+=x;return privateState.pulse^privateState.mask;}\n';
  const published='const privateState={pulse:5,mask:3};'+
    'export function touch(x){privateState.pulse+=x;return privateState.pulse^privateState.mask;}\n';
  const privateOut=symbolizeLocalProperties(body,parse(body,'module'),
    {seed:'symbol-public-source-esm'});
  assert.equal(privateOut.properties,2,'Private state must have actual Symbol yield');
  const publishedOut=symbolizeLocalProperties(published,parse(published,'module'),
    {seed:'symbol-public-source-esm'});
  assert.equal(publishedOut.properties,0,
    'Unknown ESM importing host can inspect exported callable source');

  await withTempDirectory(async(root)=>{
    const nativePath=path.join(root,'native.mjs');
    const forcedPath=path.join(root,'forced.mjs');
    await atomicWrite(nativePath,published);
    await atomicWrite(forcedPath,privateOut.code+'export {touch};\n');
    const native=/** @type {{touch:(x:number)=>number}} */(
      await import(pathToFileURL(nativePath).href));
    const forced=/** @type {{touch:(x:number)=>number}} */(
      await import(pathToFileURL(forcedPath).href));
    const originalText=Function.prototype.toString.call(native.touch);
    const forcedText=Function.prototype.toString.call(forced.touch);
    assert.match(originalText,/privateState\.pulse/u);
    assert.doesNotMatch(forcedText,/privateState\.pulse/u);
    assert.notEqual(forcedText,originalText,
      'Independent ESM consumers see the changed function source');
    for(const input of [2,4,-3,13,0]) {
      assert.ok(Object.is(native.touch(input),forced.touch(input)));
    }
    console.log('SYMBOL_PUBLIC_SOURCE_WITNESS='+JSON.stringify({
      module:'esm',privateProperties:privateOut.properties,
      publishedProperties:publishedOut.properties,
      sourceIdentical:forcedText===originalText,
      behaviorEqual:true
    }));
  });
});
