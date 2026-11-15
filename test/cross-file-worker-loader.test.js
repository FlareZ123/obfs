'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {ReturnType<typeof obfuscateFiles>['files']|{path:string,code:string,sourceType:'module'}[]} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-worker-import-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:20000
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

const exported={path:'state.mjs',sourceType:/** @type {const} */('module'),
  code:'export const state={secretField:23};'};
const dynamicWorker=[
  'import {Worker} from "node:worker_threads";',
  'const target=new URL("./state.mjs",import.meta.url).href;',
  'const code='+JSON.stringify(
    'const {parentPort}=require("node:worker_threads");'+
    'import(process.env.TARGET_URL).then(({state})=>'+
    'parentPort.postMessage(state.secretField));')+';',
  'const worker=new Worker(code,{eval:true,env:{TARGET_URL:target}});',
  'const value=await new Promise((resolve,reject)=>{worker.once("message",resolve);worker.once("error",reject);});',
  'process.stdout.write(String(value));'
].join('\n');

test('worker eval can import a supplied module without an AST import edge',async()=>{
  const files=[
    exported,
    {path:'main.mjs',sourceType:/** @type {const} */('module'),code:dynamicWorker}
  ];
  const baseline=await execute(files);
  assert.equal(baseline.status,0,baseline.stderr);
  assert.equal(baseline.stdout,'23');
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'worker-loader-escape',closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(result.crossFile.objects,0,'Untraced worker import must decline shape changes');
  const transformed=await execute(result.files);
  assert.equal(transformed.status,0,transformed.stderr);
  assert.equal(transformed.stdout,baseline.stdout);
});

for(const [name,main] of [
  ['global Worker constructor',
    'import {state} from "./state.mjs";new Worker("./external.mjs",{type:"module"});console.log(state.secretField);'],
  ['aliased Worker constructor',
    'import {state} from "./state.mjs";const Constructor=Worker;new Constructor("./external.mjs",{type:"module"});console.log(state.secretField);'],
  ['SharedWorker constructor',
    'import {state} from "./state.mjs";new SharedWorker("./external.mjs",{type:"module"});console.log(state.secretField);'],
  ['worker importScripts',
    'import {state} from "./state.mjs";importScripts("./external.js");console.log(state.secretField);'],
  ['node:vm dynamic execution',
    'import {runInThisContext} from "node:vm";import {state} from "./state.mjs";console.log(state.secretField);'],
  ['node:child_process dynamic startup',
    'import {spawn} from "node:child_process";import {state} from "./state.mjs";console.log(state.secretField);']
]) {
  test('unproved secondary loader conservatively rejects closed-world renaming: '+name,()=>{
    const output=obfuscateFiles([
      exported,{path:'main.mjs',sourceType:'module',code:main}
    ],{mode:'coo',seed:'unproved-worker-loader/'+name,closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.objects,0,main);
  });
}
