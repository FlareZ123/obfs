'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @type {Array<[string,string]>} */
const transports=[
  ['identity','export const wrap=value=>value;'],
  ['array','export const wrap=value=>[value][0];'],
  ['record','export const wrap=value=>({member:value}).member;'],
  ['map','export const wrap=value=>new Map([["owner",value]]).get("owner");'],
  ['set','export const wrap=value=>[...new Set([value])][0];'],
  ['promise','export const wrap=value=>Promise.resolve(value);'],
  ['rest','export const wrap=(...values)=>values[0];'],
  ['proxy','export const wrap=value=>new Proxy(value,{});']
];

/** @type {Array<[string,string]>} */
const observers=[
  ['keys','Object.keys(owner).join(",")'],
  ['ownKeys','Reflect.ownKeys(owner).join(",")'],
  ['names','Object.getOwnPropertyNames(owner).join(",")'],
  ['json','JSON.stringify(owner)'],
  ['forIn','(()=>{const names=[];for(const name in owner)names.push(name);return names.join(",")})()']
];

/**
 * Execute an isolated actual ESM program, retaining error output to compare
 * observable exceptions as well as successful values.
 * @param {string} root
 * @param {string} label
 * @param {ModuleFile[]} source
 */
async function run(root,label,source) {
  const directory=path.join(root,label);
  await fs.mkdir(directory,{recursive:true});
  for(const file of source)await atomicWrite(path.join(directory,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:5000
  });
  if(result.error)throw result.error;
  return {status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr};
}

/**
 * @param {string} root
 * @param {string} id
 * @param {ModuleFile[]} source
 * @param {boolean} expectRename
 */
async function compare(root,id,source,expectRename) {
  const output=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,
    strings:false,identifiers:false,seed:'transport-matrix-20261122/'+id
  });
  if(expectRename) {
    assert.ok(output.crossFile.properties>0,id+': proof-positive rewriting was lost');
  } else {
    assert.equal(output.crossFile.properties,0,id+': observable key was rewritten');
  }
  const original=await run(root,id+'-original',source);
  const generated=await run(root,id+'-generated',output.files);
  assert.equal(original.status,0,id+': unexpected native failure');
  assert.deepEqual(generated,original,id+': native/generated behavior changed');
}

test('forty cross-module object transport and reflection pairs plus sixteen proven positives',
  async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-owner-matrix-'));
    let comparisons=0;
    try {
      for(const [tName,tSource] of transports) {
        for(const [oName,oExpression] of observers) {
          const id=tName+'-'+oName;
          /** @type {ModuleFile[]} */
          const files=[
            {path:'state.mjs',sourceType:'module',
              code:'export const bag={secretField:41};'},
            {path:'transport.mjs',sourceType:'module',code:tSource},
            {path:'main.mjs',sourceType:'module',
              code:'import {bag} from "./state.mjs";'+
                'import {wrap} from "./transport.mjs";'+
                'const owner=await wrap(bag);console.log('+oExpression+');'}
          ];
          await compare(root,id,files,false);
          comparisons++;
        }
      }
      for(let positive=0;positive<16;positive++) {
        const id='positive-'+positive;
        /** @type {ModuleFile[]} */
        const files=[
          {path:'state.mjs',sourceType:'module',
            code:'export const key="secretField";'+
              'export const bag={secretField:'+String(41+positive)+'};'},
          {path:'main.mjs',sourceType:'module',
            code:'import {bag,key} from "./state.mjs";console.log(bag[key]);'}
        ];
        await compare(root,id,files,true);
        comparisons++;
      }
      assert.equal(comparisons,56);
      console.log('OPAQUE_OWNER_TRANSPORT_MATRIX '+JSON.stringify({
        transports:transports.length,observers:observers.length,
        refused:40,positive:16,comparisons
      }));
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
