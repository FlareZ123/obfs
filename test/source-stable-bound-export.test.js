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
 * Import a fresh, isolated ESM source without invoking a shell.
 * @param {string} file
 * @param {string} source
 * @returns {Promise<{hot:(first:number,second:number)=>number}>}
 */
async function load(file,source) {
  await atomicWrite(file,source);
  return /** @type {Promise<{hot:(first:number,second:number)=>number}>} */(
    import(pathToFileURL(file).href)
  );
}

test('bound public export preserves native target source when bind makes it observable',async()=>{
  const native='const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal.bind(null);';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'bound-public-private-record',
    identifiers:true,strings:false
  });
  assert.equal(output.files[0].metrics.properties,0,
    'the bound target remains source-observable to an intercepting host');
  const protectedCode=/** @type {string} */ (output.files[0].code);
  assert.match(protectedCode,/secretField/u);
  assert.match(protectedCode,/otherField/u);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-source-'));
  try {
    const original=await load(path.join(root,'original.mjs'),native);
    const protectedEntry=await load(path.join(root,'protected.mjs'),protectedCode);
    assert.equal(protectedEntry.hot.toString(),original.hot.toString());
    assert.equal(protectedEntry.hot.name,original.hot.name);
    assert.equal(protectedEntry.hot.length,original.hot.length);
    assert.deepEqual(Reflect.ownKeys(protectedEntry.hot),Reflect.ownKeys(original.hot));
    assert.throws(()=>Reflect.construct(original.hot,[1,2]),TypeError,
      'a bound arrow exposes no target constructor through instance prototype');
    assert.throws(()=>Reflect.construct(protectedEntry.hot,[1,2]),TypeError);
    for(const a of [0,1,7,19,-101]) {
      for(const b of [0,3,13,-2]) {
        assert.equal(protectedEntry.hot(a,b),original.hot(a,b));
      }
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
