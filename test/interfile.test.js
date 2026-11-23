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
    {path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};export const internalValue=state.secretValue;'},
    {path:'workerA.mjs',code:'import {state} from "./state.mjs";function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}export const partial=worker(state);'},
    {path:'workerB.mjs',code:'import {state} from "./state.mjs";const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',code:'import {state,internalValue} from "./state.mjs";import {partial as a} from "./workerA.mjs";import {partial as b} from "./workerB.mjs";export const value=(+a)+(+b)+internalValue+state.secretValue+globalThis.window.api.bridge;'}
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

test('exported reader source observation keeps public function and object spellings',async()=>{
  const inputs=[
    {path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};export function internal(){return state.secretValue;}'},
    {path:'index.mjs',code:'import {state,internal} from "./state.mjs";export const total=internal()+state.secretValue;export {internal};'}
  ];
  const output=obfuscateFiles(inputs,{mode:'coo',seed:'exported-source-reader',closedWorld:true,strings:false,identifiers:false});
  assert.equal(output.crossFile.objects,0);
  assert.equal(output.crossFile.properties,0);
  const source=output.files.find(file=>file.path==='state.mjs');
  assert.ok(source);
  assert.match(String(source.code),/state\.secretValue/);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-reader-'));
  try{
    for(const file of output.files)await atomicWrite(path.join(root,file.path),file.code);
    const entryUrl=new URL('file://'+path.join(root,'index.mjs')).href;
    const command=`import(${JSON.stringify(entryUrl)}).then(m=>console.log(JSON.stringify({total:m.total,source:m.internal.toString().includes('secretValue')})));`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',command],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()),{total:6,source:true});
  }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('diagnostic matrix identifies first cross-file positive-proof boundary',()=>{
  const state={path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};'};
  const primitive={path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};export const internalValue=state.secretValue;'};
  const visible={path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};export function internal(){return state.secretValue;}'};
  const index={path:'index.mjs',code:'import {state} from "./state.mjs";export const value=state.secretValue;'};
  const global={path:'index.mjs',code:'import {state} from "./state.mjs";export const value=state.secretValue+globalThis.window.api.bridge;'};
  const a={path:'workerA.mjs',code:'import {state} from "./state.mjs";function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}export const partial=worker(state);'};
  const b={path:'workerB.mjs',code:'import {state} from "./state.mjs";const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'};
  const indexCode=(expr,add='')=>({path:'index.mjs',code:'import {state} from "./state.mjs";import {partial as a} from "./workerA.mjs";import {partial as b} from "./workerB.mjs";'+add+'export const value='+expr+';'});
  const all=indexCode('a+b+state.secretValue');
  const unary=indexCode('(+a)+(+b)+state.secretValue');
  const unused=indexCode('state.secretValue');
  const reexport=indexCode('state.secretValue','export const aResult=a;export const bResult=b;');
  const globalReexport=indexCode('state.secretValue+globalThis.window.api.bridge','export const aResult=a;export const bResult=b;');
  const primAll=indexCode('(+a)+(+b)+internalValue+state.secretValue').code.replace('import {state}','import {state,internalValue}');
  const variants=[
    ['state-only',[state]],
    ['state-index',[state,index]],
    ['state-global',[state,global]],
    ['state-workerA',[state,a]],
    ['state-workerB',[state,b]],
    ['state-A-B',[state,a,b]],
    ['full-binary-plus',[state,a,b,all]],
    ['full-unary-plus',[state,a,b,unary]],
    ['full-unused',[state,a,b,unused]],
    ['full-reexport',[state,a,b,reexport]],
    ['full-global-reexport',[state,a,b,globalReexport]],
    ['primitive-index',[primitive,index]],
    ['primitive-all',[primitive,a,b,{path:'index.mjs',code:primAll}]],
    ['visible-index',[visible,index]]
  ];
  const observations=variants.map(([name,files])=>{
    const output=obfuscateFiles(files,{mode:'coo',seed:'matrix',closedWorld:true,strings:false,identifiers:false});
    return {name,objects:output.crossFile.objects,properties:output.crossFile.properties};
  });
  console.log('INTERFILE_MATRIX '+JSON.stringify(observations));
  assert.equal(observations.length,14);
});
