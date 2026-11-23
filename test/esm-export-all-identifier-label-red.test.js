'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

const sources=[
  {path:'dep.mjs',sourceType:'module',code:'export const sentinel=7;'},
  {path:'owner.mjs',sourceType:'module',code:[
    'const privateKey=1;',
    'export * as privateKey from "./dep.mjs";',
    'export const localValue=privateKey;'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {privateKey,localValue} from "./owner.mjs";',
    'export const proof=[privateKey.sentinel,localValue];'
  ].join('\n')}
];

/** @param {string} folder @param {{path:string,code:string}[]} files */
async function writeGraph(folder,files){
  await fs.mkdir(folder,{recursive:true});
  for(const file of files){
    await fs.writeFile(path.join(folder,file.path),file.code+'\n');
  }
}

/** @param {string} folder @returns {Promise<unknown>} */
async function evaluateGraph(folder){
  const url=pathToFileURL(path.join(folder,'entry.mjs')).href;
  return (await import(url)).proof;
}

test('export-star namespace label must survive unrelated local const identifier rename',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-all-rename-'));
  try {
    const nativePath=path.join(root,'native'),compiledPath=path.join(root,'compiled');
    await writeGraph(nativePath,sources);
    const native=await evaluateGraph(nativePath);
    assert.deepEqual(native,[7,1]);

    const transformed=obfuscateFiles(sources,{
      mode:'coo',seed:'export-all-label-source-identity',strings:false
    });
    const owner=transformed.files.find(file=>file.path==='owner.mjs');
    assert.ok(owner);
    assert.ok(owner.metrics.bindings>0,
      'positive control: local binding should be renamed in the owner module');
    await writeGraph(compiledPath,transformed.files);
    const observed=await evaluateGraph(compiledPath);
    assert.deepEqual(observed,native,
      'nonlocal export namespace name must not be changed by a local-name transform');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
