'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
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

/** @param {string} folder @param {{path:string,code:string|Buffer}[]} files */
async function writeGraph(folder,files){
  await fs.mkdir(folder,{recursive:true});
  for(const file of files){
    await fs.writeFile(path.join(folder,file.path),typeof file.code==='string'?file.code+'\n':file.code);
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

test('import-attribute key must survive unrelated local const identifier rename',{
  timeout:30000
},async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const input=[
    {path:'owner.mjs',sourceType:'module',code:[
      'import data from "./data.json" with {type:"json"};',
      'const type=1;',
      'export const view=[data.value,type];'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {view} from "./owner.mjs";',
      'export const proof=view;'
    ].join('\n')}
  ];
  const json={path:'data.json',code:'{"value":42}'};
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-import-attribute-rename-'));
  try{
    const nativePath=path.join(root,'native'),compiledPath=path.join(root,'compiled');
    await writeGraph(nativePath,[...input,json]);
    const native=await evaluateGraph(nativePath);
    assert.deepEqual(native,[42,1]);
    const transformed=obfuscateFiles(input,{
      mode:'coo',seed:'import-attribute-label-source-identity',
      strings:false,properties:false
    });
    const owner=transformed.files.find(file=>file.path==='owner.mjs');
    assert.ok(owner);
    assert.ok(owner.metrics.bindings>0,'positive local-name rename control');
    await writeGraph(compiledPath,[...transformed.files,json]);
    assert.deepEqual(await evaluateGraph(compiledPath),native,
      'module attribute type label must remain literal even when local name is mangled');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
