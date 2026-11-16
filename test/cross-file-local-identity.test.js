'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

/** @typedef {{path:string,sourceType:'module',code:string}} File */

/**
 * Run a three-module graph with the same unowned external window API.
 * The dynamic import occurs after the host API is installed.
 * @param {string} dir
 * @param {File[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function execute(dir,files) {
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const runner=[
    'globalThis.window={api:{offset:5,dynamicKey:"privateMetric",',
    'observe(object){return Object.keys(object).length;}}};',
    'import("./entry.mjs").then(()=>{}).catch(error=>{',
    'console.error(error);process.exitCode=1;});'
  ].join('');
  await atomicWrite(path.join(dir,'runner.mjs'),runner);
  const child=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/**
 * @param {number} seed
 * @param {string} logic
 * @param {number} expectedRenames
 * @returns {Promise<void>}
 */
async function compare(seed,logic,expectedRenames) {
  const source='export const state={privateMetric:'+(17+seed)+
    ',weightedFactor:'+(7+seed)+'};';
  /** @type {File[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:source},
    {path:'logic.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+logic},
    {path:'entry.mjs',sourceType:'module',
      code:'import {outcome} from "./logic.mjs";process.stdout.write(JSON.stringify(outcome));'}
  ];
  const transformed=obfuscateFiles(files,{
    mode:'coo',seed:'cross-local-wrapper-'+seed,
    closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.properties,expectedRenames,
    'Unexpected private-property coverage: '+logic);
  assert.ok(/** @type {string} */ (transformed.files[1].code).includes('window.api.offset'),
    'External global API names must remain stable');
  const dirs=await Promise.all(['original','compiled','normalized'].map(name=>
    fs.mkdtemp(path.join(os.tmpdir(),'obfs-local-cross-'+name+'-'))));
  try {
    const original=await execute(dirs[0],files);
    const compiled=await execute(dirs[1],transformed.files);
    assert.equal(compiled,original,'Compiled graph behavior differs');
    const recovered=neutralizeHashedNames(transformed.files.map(file=>({
      path:file.path,sourceType:'module',code:/** @type {string} */ (file.code)
    })));
    assert.ok(recovered.properties>=expectedRenames);
    assert.equal(await execute(dirs[2],recovered.files),original,
      'Static name normalization must preserve behavior');
  }finally{
    for(const dir of dirs)await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const [name,logic,expected] of [
  ['immutable local arrow',
    'const relay=value=>value;const alias=relay(state);'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['immutable local function expression',
    'const relay=function inner(value){return value;};const alias=relay(state);'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['block arrow and two aliases',
    'const relay=value=>{return value;};const first=relay(state);let second=first;'+
    'export const outcome=second.privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['immutable private getter',
    'const get=()=>state;const alias=get();'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['private getter as a local function declaration',
    'function get(){return state;}get();const alias=get();'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['exported getter leaks private owner to unknown imports',
    'export const get=()=>state;const alias=get();'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',0],
  ['inline getter result is proven',
    'const get=()=>state;'+
    'export const outcome=get().privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['inline identity forwarding result is proven',
    'const relay=value=>value;'+
    'export const outcome=relay(state).privateMetric+state.weightedFactor+globalThis.window.api.offset;',2],
  ['computed inline getter result is proven',
    'const get=()=>state;'+
    'export const outcome=get()["privateMetric"]+state.weightedFactor+globalThis.window.api.offset;',2],
  ['unknown computed field on immediate getter is refused',
    'const get=()=>state;const key=globalThis.window.api.dynamicKey;'+
    'export const outcome=get()[key]+state.weightedFactor+globalThis.window.api.offset;',0],
  ['reflecting wrapper',
    'const relay=value=>(Object.keys(value),value);const alias=relay(state);'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',0],
  ['opaque external observation',
    'const relay=value=>value;globalThis.window.api.observe(state);const alias=relay(state);'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',0],
  ['dynamic key from external host',
    'const key=globalThis.window.api.dynamicKey;'+
    'export const outcome=state[key]+state.weightedFactor+globalThis.window.api.offset;',0],
  ['callback escape of otherwise pure wrapper',
    'const relay=value=>value;const callback=relay;const alias=relay(state);'+
    'export const outcome=alias.privateMetric+state.weightedFactor+globalThis.window.api.offset;',0]
]) {
  for(const seed of [0,1,2]) {
    test('closed-world ESM local identity / '+name+' / seed '+seed,
      async()=>compare(seed,logic,expected));
  }
}
