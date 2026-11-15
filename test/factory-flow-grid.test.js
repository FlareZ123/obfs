'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{files:SourceFile[],safe:boolean,label:string}} Case */

/** @param {number} serial @param {number} style @returns {string} */
function factory(serial,style) {
  const name='make'+serial;
  const a='private'+serial+'First',b='private'+serial+'Second';
  const literal='{'+a+':'+(serial*3+11)+','+b+':'+(serial*7+13)+'}';
  if(style===0)return 'function '+name+'(){return '+literal+';}export const shared='+name+'();';
  if(style===1)return 'const '+name+'=()=>('+literal+');export const shared='+name+'();';
  if(style===2)return 'const '+name+'=function privateFactory(){return '+literal+';};export const shared='+name+'();';
  if(style===3)return 'export const shared=(()=>('+literal+'))();';
  return 'export const shared=(function ephemeral(){return '+literal+';})();';
}

/** @param {number} serial @param {number} shape @returns {string} */
function consumer(serial,shape) {
  const a='private'+serial+'First',b='private'+serial+'Second';
  const base='import {shared} from "./state.mjs";';
  switch(shape) {
    case 0:return base+'console.log(shared.'+a+'+shared.'+b+');';
    case 1:return base+'const alias=shared;console.log(alias["'+a+'"]+alias.'+b+');';
    case 2:return base+'const {'+a+':first,'+b+':second}=shared;console.log(first+second);';
    case 3:return 'import {shared,read} from "./state.mjs";console.log(read(shared)+shared.'+b+');';
    case 4:return base+'const get=()=>shared;const alias=get();console.log(alias.'+a+'+alias.'+b+');';
    case 5:return base+'const identity=x=>x;const alias=identity(shared);console.log(alias.'+a+'+alias.'+b+');';
    default:return base+'import {identity} from "./identity.mjs";'+
      'const alias=identity(shared);console.log(alias.'+a+'+alias.'+b+');';
  }
}

/**
 * @param {number} serial
 * @param {number} style
 * @param {number} shape
 * @returns {Case}
 */
function safeCase(serial,style,shape){
  const a='private'+serial+'First';
  const state=factory(serial,style)+(shape===3 ?
    'export function read(value){return value.'+a+';}' : '');
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:consumer(serial,shape)}
  ];
  if(shape===6)files.push({path:'identity.mjs',sourceType:'module',
    code:'export const identity=value=>value;'});
  return {label:'positive/'+serial+'/factory-'+style+'/consumer-'+shape,
    safe:true,files};
}

/** @param {number} serial @param {number} kind @returns {Case} */
function refusalCase(serial,kind) {
  const a='private'+serial+'First',b='private'+serial+'Second';
  let state=factory(serial,0),entry=consumer(serial,0);
  switch(kind) {
    case 0:
      entry='import {shared} from "./state.mjs";const key="'+a+'";console.log(shared[key]+shared.'+b+');';
      break;
    case 1:
      entry='import {shared} from "./state.mjs";console.log(Object.keys(shared).join(","));';
      break;
    case 2:
      entry='import * as ns from "./state.mjs";console.log(ns.shared.'+a+');';
      break;
    case 3:
      entry='import {shared} from "./state.mjs";const {'+a+':first,...remaining}=shared;console.log(first,Object.keys(remaining).join(","));';
      break;
    case 4:
      state=state.replace('function make'+serial+'(){','export function make'+serial+'(){');
      break;
    case 5:
      state='function make'+serial+'(){return {'+a+':17,'+b+':5};}'+
        'const extra=make'+serial+'();export const shared=make'+serial+'();';
      break;
    case 6:
      state=state.replace('export const shared=make'+serial+'();',
        'export const shared=make'+serial+'?.();');
      break;
    case 7:
      state+='export function read(value){return value.'+a+';}';
      entry='import {shared,read} from "./state.mjs";console.log(read.toString().includes("'+a+'"),shared.'+b+');';
      break;
    case 8:
      entry='import {shared} from "./state.mjs";console.log(JSON.stringify(shared));';
      break;
    default:
      entry='import {shared} from "./state.mjs";'+
        'const extra={'+a+':99};console.log(shared.'+a+'+shared.'+b+',Object.keys(extra).length);';
      // A foreign own object should not be confused with a read of shared.
      // This last case is a positive control rather than an unsafe rejection.
      return {label:'independent-foreign-object',safe:true,
        files:[{path:'state.mjs',sourceType:'module',code:state},
          {path:'entry.mjs',sourceType:'module',code:entry}]};
  }
  return {label:'refusal/'+kind+'/seed-'+serial,safe:false,files:[
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ]};
}

/** @param {SourceFile[]} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-grid-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:7000
    });
    assert.equal(run.status,0,run.stderr);
    return run.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('held-out private factory ownership grid: 35 positive ESM graphs, 9 conservative refusals',async()=>{
  /** @type {Case[]} */
  const cases=[];
  let serial=0;
  for(let style=0;style<5;style++){
    for(let shape=0;shape<7;shape++){
      cases.push(safeCase(serial++,style,shape));
    }
  }
  for(let kind=0;kind<9;kind++)cases.push(refusalCase(serial++,kind));
  const independent=refusalCase(serial,9);
  cases.push(independent);
  let positive=0,negative=0,renames=0,neutralized=0;
  for(const fixture of cases){
    const baseline=await execute(fixture.files);
    const output=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,seed:'factory-heldout-grid/'+fixture.label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,fixture.safe?2:0,fixture.label);
    assert.equal(await execute(output.files),baseline,fixture.label);
    if(fixture.safe){
      positive++;
      renames+=output.crossFile.properties;
      const attacked=normalizeDistributedFiles(output.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.equal(attacked.properties,2,fixture.label);
      assert.equal(await execute(attacked.files),baseline,fixture.label);
      neutralized+=attacked.properties;
    }else negative++;
  }
  assert.equal(positive,36);
  assert.equal(negative,9);
  assert.equal(renames,72);
  assert.equal(neutralized,72);
});
