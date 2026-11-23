'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const inputs=[
  {path:'dep.mjs',sourceType:'module',code:'export const sentinel=17;'},
  {path:'owner.mjs',sourceType:'module',code:[
    'const retained=13;',
    'export * as retained from "./dep.mjs";',
    'export const local=retained;'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {retained,local} from "./owner.mjs";',
    'export const result=[retained.sentinel,local];'
  ].join('\n')}
];

/**
 * @param {string} location
 * @param {{path:string,code:string|Buffer}[]} files
 */
async function writeModules(location,files){
  await fs.mkdir(location,{recursive:true});
  for(const file of files){
    await fs.writeFile(path.join(location,file.path),
      typeof file.code==='string'?file.code+'\n':file.code);
  }
}

/** @param {string} location @returns {Promise<unknown>} */
async function loadResult(location){
  const entry=await import(pathToFileURL(path.join(location,'entry.mjs')).href);
  return entry.result;
}

test('SCO COO SNO ESM re-export namespace label is preserved with positive local renaming',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-label-modes-'));
  try{
    await writeModules(path.join(root,'native'),inputs);
    const native=await loadResult(path.join(root,'native'));
    assert.deepEqual(native,[17,13]);
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const transformed=obfuscateFiles(inputs,{
        mode,seed:'same-export-alias-proof-'+mode,
        strings:false,properties:false
      });
      const owner=transformed.files.find(file=>file.path==='owner.mjs');
      assert.ok(owner);
      assert.ok(owner.metrics.bindings>0,mode+': local rename remains enabled');
      const destination=path.join(root,mode);
      await writeModules(destination,transformed.files);
      const actual=await loadResult(destination);
      assert.deepEqual(actual,native,mode+': must keep public namespace export name');
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
