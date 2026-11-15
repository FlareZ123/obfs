'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('four-file ESM dataflow preserves named imports, nested calls and external APIs',async()=>{
  const inputs=[
    {path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};export function internal(){return state.secretValue;}'},
    {path:'workerA.mjs',code:'import {state} from "./state.mjs";function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}export const partial=worker(state);'},
    {path:'workerB.mjs',code:'import {state} from "./state.mjs";const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',code:'import {state,internal} from "./state.mjs";import {partial as a} from "./workerA.mjs";import {partial as b} from "./workerB.mjs";export const value=(+a)+(+b)+internal()+state.secretValue+globalThis.window.api.bridge;'}
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-four-esm-'));
  try{
    const output=obfuscateFiles(inputs,{mode:'coo',seed:'four-files',closedWorld:true,strings:true,identifiers:true});
    assert.equal(output.crossFile.objects,1);
    assert.equal(output.crossFile.properties,2);
    const entry=output.files.find(f=>f.path==='index.mjs');
    assert.match(entry.code,/globalThis\.window\.api\.bridge/);
    for(const file of output.files)await atomicWrite(path.join(root,file.path),file.code);
    const entryUrl=new URL('file://'+path.join(root,'index.mjs')).href;
    const command=`globalThis.window={api:{bridge:10}};import(${JSON.stringify(entryUrl)}).then(x=>console.log(x.value));`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',command],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),String(8+15+3+3+10));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
