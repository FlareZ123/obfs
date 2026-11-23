'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

const producer='export function compute(){const state={secretField:29,bonusField:3};' +
  'return state.secretField+state.bonusField;}';

/** @param {string} root @param {{path:string,code:string}[]} files @returns {Promise<void>} */
async function writeGraph(root,files){
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
}

/** @param {string} directory @returns {Promise<{result:number,spelling:string}>} */
async function importGraph(directory){
  const ns=await import(pathToFileURL(path.join(directory,'consumer.mjs')).href);
  return {result:/** @type {number} */(ns.result),
    spelling:/** @type {string} */(ns.spelling)};
}

for(const [label,observer] of [
  ['direct-String','String(compute)'],
  ['interprocedural-array-join','sourceView(compute)']
]){
  test('COO closed-world ESM preserves source observation '+label,async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-join-'));
    t.after(async()=>fs.rm(root,{recursive:true,force:true}));
    const consumer="import {compute} from './producer.mjs';" +
      (label==='interprocedural-array-join'?
        'function sourceView(fn){return [fn].join("");}':'') +
      'export const result=compute();export const spelling='+observer+';';
    const files=[
      {path:'producer.mjs',sourceType:/** @type {const} */('module'),code:producer},
      {path:'consumer.mjs',sourceType:/** @type {const} */('module'),code:consumer}
    ];
    const built=obfuscateFiles(files,{mode:'coo',closedWorld:true,
      seed:'esm-cross-module-source-join-v1',
      strings:false,identifiers:false,properties:true});
    const output=built.files.map(file=>({
      path:file.path,code:/** @type {string} */(file.code)
    }));
    await writeGraph(path.join(root,'native'),files);
    await writeGraph(path.join(root,'built'),output);
    const native=await importGraph(path.join(root,'native'));
    const compiled=await importGraph(path.join(root,'built'));
    console.log('ESM_SOURCE_OBSERVER_PROOF '+JSON.stringify({label,
      transformed:built.files.map(x=>({path:x.path,properties:x.metrics.properties})),
      nativeSourceChars:native.spelling.length,
      compiledSourceChars:compiled.spelling.length
    }));
    assert.equal(native.result,32);
    assert.equal(compiled.result,native.result);
    assert.equal(compiled.spelling,native.spelling,
      'Rewriting an imported callable changes exact Function source');
  });
}
