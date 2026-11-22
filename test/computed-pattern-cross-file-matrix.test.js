'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{label:string,files:ModuleFile[],expectPositive:boolean}} Case */

/**
 * Every generated graph contains exactly one exported private record and one
 * closed-world immutable key proof. Separate key reexports and aliases are
 * deliberately included to avoid assuming a single file's lexical tokens
 * supply all owner-use information.
 *
 * @param {'named'|'relay'|'separate'|'default'} graph
 * @param {'before'|'after'} declarationOrder
 * @param {'plain'|'alias'} naming
 * @param {'direct'|'default'|'assignment'} readStyle
 * @returns {Case}
 */
function build(graph,declarationOrder,naming,readStyle){
  const label=[graph,declarationOrder,naming,readStyle].join('/');
  const owner='export const bag={secretField:41,bias:2};';
  const defaultOwner='export default {secretField:41,bias:2};';
  const selector='export const key="secretField";';
  /** @type {ModuleFile[]} */
  const files=[];
  /** @type {string[]} */
  const imports=[];
  let receiver='bag';
  let key='key';
  if(graph==='named'){
    files.push({path:'state.mjs',sourceType:'module',
      code:declarationOrder==='before'?selector+owner:owner+selector});
    imports.push(naming==='plain'?
      'import {bag,key} from "./state.mjs";':
      'import {bag as record,key as chosen} from "./state.mjs";');
    if(naming==='alias'){receiver='record';key='chosen';}
  }else if(graph==='relay'){
    files.push({path:'state.mjs',sourceType:'module',
      code:declarationOrder==='before'?selector+owner:owner+selector});
    files.push({path:'relay.mjs',sourceType:'module',
      code:'export {key as exposedKey} from "./state.mjs";'});
    imports.push(naming==='plain'?
      'import {bag} from "./state.mjs";import {exposedKey} from "./relay.mjs";':
      'import {bag as record} from "./state.mjs";'+
      'import {exposedKey as chosen} from "./relay.mjs";');
    key=naming==='plain'?'exposedKey':'chosen';
    if(naming==='alias')receiver='record';
  }else if(graph==='separate'){
    files.push({path:'state.mjs',sourceType:'module',code:owner});
    files.push({path:'keys.mjs',sourceType:'module',
      code:declarationOrder==='before'?selector+'export const filler=2;':
        'export const filler=2;'+selector});
    imports.push(naming==='plain'?
      'import {bag} from "./state.mjs";import {key} from "./keys.mjs";':
      'import {bag as record} from "./state.mjs";'+
      'import {key as chosen} from "./keys.mjs";');
    if(naming==='alias'){receiver='record';key='chosen';}
  }else{
    files.push({path:'state.mjs',sourceType:'module',
      code:declarationOrder==='before'?
        selector+defaultOwner:defaultOwner+selector});
    imports.push(naming==='plain'?
      'import bag,{key} from "./state.mjs";':
      'import record,{key as chosen} from "./state.mjs";');
    if(naming==='alias'){receiver='record';key='chosen';}
  }
  const access=readStyle==='direct'?
    `const {[${key}]:value}=${receiver};console.log(value);`:
    readStyle==='default'?
      `const {[${key}]:value=99}=${receiver};console.log(value);`:
      `let value;({[${key}]:value}=${receiver});console.log(value);`;
  files.push({path:'main.mjs',sourceType:'module',
    code:imports.join('')+access});
  return {label,files,expectPositive:true};
}

/** @type {Case[]} */
const cases=[];
for(const graph of /** @type {const} */ (['named','relay','separate','default'])){
  for(const order of /** @type {const} */ (['before','after'])){
    for(const naming of /** @type {const} */ (['plain','alias'])){
      for(const style of /** @type {const} */ (['direct','default','assignment'])){
        cases.push(build(graph,order,naming,style));
      }
    }
  }
}

cases.push({
  label:'cyclic later-key refusal',
  expectPositive:false,
  files:[
    {path:'state.mjs',sourceType:'module',
      code:'import "./main.mjs";export const bag={secretField:41,bias:2};'+
        'export const key="secretField";'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,key} from "./state.mjs";'+
        'export function read(){const {[key]:value}=bag;console.log(value);}read();'}
  ]
},{
  label:'mutable imported key refusal',
  expectPositive:false,
  files:[
    {path:'state.mjs',sourceType:'module',
      code:'export let key="secretField";export const bag={secretField:41,bias:2};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,key} from "./state.mjs";const {[key]:value}=bag;console.log(value);'}
  ]
},{
  label:'opaque environment key refusal',
  expectPositive:false,
  files:[
    {path:'state.mjs',sourceType:'module',
      code:'export const bag={secretField:41,bias:2};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag} from "./state.mjs";'+
        'const {[process.env.OBFS_KEY]:value}=bag;console.log(value);'}
  ]
},{
  label:'imported key with enumerable reflection refusal',
  expectPositive:false,
  files:[
    {path:'state.mjs',sourceType:'module',
      code:'export const bag={secretField:41,bias:2};export const key="secretField";'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,key} from "./state.mjs";'+
        'const {[key]:value}=bag;console.log(value,Object.keys(bag).join(","));'}
  ]
});

/**
 * Execute one declared ESM graph in a fresh process without injecting a
 * loader, sandbox-specific globals or a synthetic module transform.
 * @param {string} directory
 * @param {ModuleFile[]} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string,signal:NodeJS.Signals|null}>}
 */
async function execute(directory,files){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:5000,env:{...process.env,OBFS_KEY:'secretField'}
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr,signal:child.signal};
}

for(const [index,fixture] of cases.entries()){
  test('computed ESM owner parity '+fixture.label,async()=>{
    const compiled=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'computed-cross-file-matrix/'+index
    });
    if(fixture.expectPositive){
      assert.ok(compiled.crossFile.properties>0,
        fixture.label+' unexpectedly refused a statically proved private owner');
    }else{
      assert.equal(compiled.crossFile.properties,0,
        fixture.label+' must not rename the externally observable private field');
    }
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-cross-'));
    try{
      const original=await execute(path.join(directory,'original'),fixture.files);
      assert.equal(original.status,0,original.stderr);
      const obfuscated=await execute(path.join(directory,'obfuscated'),
        /** @type {ModuleFile[]} */ (compiled.files));
      assert.deepEqual(obfuscated,original);
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
}
