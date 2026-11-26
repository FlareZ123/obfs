'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} target
 * @param {string} source
 * @returns {Promise<{hot:(a:number)=>number}>}
 */
async function load(target,source) {
  await atomicWrite(target,source);
  return /** @type {Promise<{hot:(a:number)=>number}>} */(
    import(pathToFileURL(target).href)
  );
}

test('known constructible-bound source-observation regression remains refused',async()=>{
  const native='const owner={secretField:7};'+
    'function internal(privateInput){return owner.secretField+privateInput;}'+
    'export const hot=internal.bind(null);';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'bound-constructor-source-reachability',
    properties:true,identifiers:true,strings:false
  });
  console.log('constructible-bound-source-regression metrics: '+JSON.stringify(output.files[0].metrics));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-ctor-source-regression-'));
  try{
    const original=await load(path.join(root,'native.mjs'),native);
    const protectedEntry=await load(path.join(root,'protected.mjs'),String(output.files[0].code));
    assert.equal(protectedEntry.hot(3),original.hot(3));
    assert.equal(protectedEntry.hot.toString(),original.hot.toString());
    const originalTarget=Reflect.construct(original.hot,[3]).constructor;
    const emittedTarget=Reflect.construct(protectedEntry.hot,[3]).constructor;
    assert.equal(emittedTarget.toString(),originalTarget.toString(),
      'an exported bound constructor exposes its underlying target Function#toString');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
