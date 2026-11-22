'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleInput */

/**
 * Import a declared public entry from a fresh directory. The state module
 * is an internal dependency under the caller's closed-world contract.
 * @param {string} root
 * @param {ModuleInput[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{hot:(initial:number,iterations:number)=>number}>}
 */
async function loadEntry(root,files) {
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  return /** @type {Promise<{hot:(initial:number,iterations:number)=>number}>} */ (
    import(pathToFileURL(path.join(root,'worker.mjs')).href)
  );
}

test('private cross-module hot reads preserve the public wrapper source and retain actual renames',async()=>{
  /** @type {ModuleInput[]} */
  const native=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={hotScore:(21-14),hotWeight:(5<<2)-7};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'function privateHot(initial,iterations){'+
        'let value=initial|0;for(let i=0;i<iterations;i++){'+
        'value=((value+state.hotScore)^state.hotWeight)|0;}return value;}'+
        'export function hot(initial,iterations){return privateHot(initial,iterations);}'} 
  ];
  const output=obfuscateFiles(native,{
    mode:'coo',closedWorld:true,seed:'private-wrapper-positive',
    identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,2,'private worker must exercise two transformed own keys');
  assert.doesNotMatch(output.files.map(file=>file.code).join(''),/hotScore|hotWeight/u,
    'the original own-field spellings must disappear from the protected closed-world graph');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-wrapper-'));
  try {
    const original=await loadEntry(path.join(folder,'original'),native);
    const protectedEntry=await loadEntry(path.join(folder,'protected'),output.files);
    assert.equal(protectedEntry.hot.toString(),original.hot.toString(),
      'public entry callable source is an exact observed value');
    for(const input of [0,1,7,43,511,-91]) {
      assert.equal(protectedEntry.hot(input,10000),original.hot(input,10000));
    }
  } finally {
    await fs.rm(folder,{recursive:true,force:true});
  }
});
