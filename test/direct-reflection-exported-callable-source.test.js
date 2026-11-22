'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleInput */

/**
 * Write the protected distribution plus an importer that is deliberately
 * outside the obfuscator's input graph, then observe exported callable source.
 * @param {string} dir
 * @param {{path:string,code:string|Buffer}[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function execute(dir,files,observer) {
  for(const file of files) {
    const target=path.join(dir,file.path);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,file.code);
  }
  await fs.writeFile(path.join(dir,'observer.mjs'),observer,'utf8');
  const child=spawnSync(process.execPath,[path.join(dir,'observer.mjs')],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/**
 * @param {ModuleInput[]} files
 * @param {string} observer
 * @param {number} expectedRenames
 * @param {string} label
 */
async function check(files,observer,expectedRenames,label) {
  const nativeDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-reflect-native-'));
  const compiledDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-reflect-compiled-'));
  try {
    const transformed=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,
      seed:'exported-direct-reflection-source/'+label,
      identifiers:false,strings:false
    });
    const native=await execute(nativeDir,files,observer);
    const compiled=await execute(compiledDir,transformed.files,observer);
    assert.equal(compiled,native,label+': external importer observed changed callable source or result');
    assert.equal(transformed.crossFile.properties,expectedRenames,
      label+': unexpected cross-file protected yield');
  }finally {
    await fs.rm(nativeDir,{recursive:true,force:true});
    await fs.rm(compiledDir,{recursive:true,force:true});
  }
}

test('exported ESM function source preserves direct reflective owner keys',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:3};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";export function read(){return Reflect.get(state,"secretField");}'}
  ],
  'import {read} from "./worker.mjs";process.stdout.write(JSON.stringify([read.toString(),read()]));',
  0,'exported-function');
});

test('exported ESM object method source preserves direct reflective owner keys',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:5};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";export const api={read(){return Reflect.get(state,"secretField");}};'}
  ],
  'import {api} from "./worker.mjs";process.stdout.write(JSON.stringify([api.read.toString(),api.read()]));',
  0,'exported-object-method');
});

test('unexported reflective helper retains positive private-owner yield',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:7};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";function privateRead(){return Reflect.get(state,"secretField");}export function read(){return privateRead();}'}
  ],
  'import {read} from "./worker.mjs";process.stdout.write(JSON.stringify([read.toString(),read()]));',
  1,'private-helper-positive');
});

test('exported ESM function source preserves direct reflective writes',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:3};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";export function write(value){return Reflect.set(state,"secretField",value);}'}
  ],
  'import {write} from "./worker.mjs";process.stdout.write(JSON.stringify([write.toString(),write(9)]));',
  0,'exported-reflect-set');
});

test('unexported reflective write helper retains positive private-owner yield',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:3};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";function privateWrite(value){return Reflect.set(state,"secretField",value);}export function write(value){return privateWrite(value);}'}
  ],
  'import {write} from "./worker.mjs";process.stdout.write(JSON.stringify([write.toString(),write(9)]));',
  1,'private-reflect-set-helper');
});


test('patched Promise.then callback cannot expose rewritten reflective key',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:11};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";function start(){return Promise.resolve().then(function hiddenCallback(){return Reflect.get(state,"secretField");});}export function run(){return start();}'}
  ],
  'const nativeThen=Promise.prototype.then;const captured=[];Promise.prototype.then=function(onFulfilled,onRejected){if(typeof onFulfilled==="function"&&onFulfilled.name==="hiddenCallback")captured.push(onFulfilled);return nativeThen.call(this,onFulfilled,onRejected);};const {run}=await import("./worker.mjs");const value=await run();const callback=captured[0];if(!callback)throw new Error("host failed to capture hiddenCallback");process.stdout.write(JSON.stringify([run.toString(),callback.toString(),value]));',
  0,'patched-promise-callback');
});

test('native Promise private callback retains positive reflective yield',async()=>{
  await check([
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:13};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";function start(){return Promise.resolve().then(function hiddenCallback(){return Reflect.get(state,"secretField");});}export function run(){return start();}'}
  ],
  'const {run}=await import("./worker.mjs");const value=await run();process.stdout.write(JSON.stringify([run.toString(),value]));',
  1,'native-promise-private-callback');
});
