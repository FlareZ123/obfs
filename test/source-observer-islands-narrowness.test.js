'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const sources=[
  {path:'watched.mjs',sourceType:'module',code:
    'const a={publicField:17};const n=a.publicField;'+
    'export function watched(){return n;}'},
  {path:'independent.mjs',sourceType:'module',code:
    'const b={privateB:23};const n=b.privateB;'+
    'export function unrelated(){return n;}'},
  {path:'entry.mjs',sourceType:'module',code:
    'import {watched} from "./watched.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'console.log(JSON.stringify({fn:watched.toString(),n:unrelated()}));'}
];

/**
 * @param {SourceFile[]|import('../src/core').OutputFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-narrow-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('island exception unlocks only proven local keys, never other observer-unsafe backends',async()=>{
  const native=await execute(sources);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const options={mode,seed:'island-narrow-'+mode,
      closedWorld:true,strings:true,identifiers:true,
      experimentalSourceObserverIslands:['independent.mjs']};
    const output=obfuscateFiles(sources,options);
    const selected=output.files.find(file=>file.path==='independent.mjs');
    assert.ok(selected,mode+': selected output present');
    assert.ok(selected.metrics.properties>=1,mode+': own-field naming yield');
    assert.equal(selected.metrics.bindings,0,mode+': no local identifier renaming');
    assert.equal(selected.metrics.literals,0,mode+': no string decoding helpers');
    assert.equal(output.crossFile.properties,0,mode+': no cross-file property rewriting');
    assert.equal(output.files.find(f=>f.path==='watched.mjs')?.code,
      sources[0].code,mode+': observed producer retained byte-for-byte');
    assert.equal(output.files.find(f=>f.path==='entry.mjs')?.code,
      sources[2].code,mode+': observer retained byte-for-byte');
    assert.equal(await execute(output.files),native,mode+': executable output parity');
    const baseline=obfuscateFiles(sources,{...options,
      experimentalSourceObserverIslands:undefined});
    assert.equal(baseline.files.reduce((n,file)=>n+file.metrics.properties,0),
      0,mode+': without an explicit proof, the observer veto remains global');
  }
});
