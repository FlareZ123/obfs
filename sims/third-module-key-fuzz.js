'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('./offline-normalize');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

const seed=0x61ac2d9f;
let state=seed;

/** @returns {number} */
function random(){
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/**
 * Generate five positive graphs and five conservative-refusal graphs. The cycle case
 * intentionally invokes an importer function before its sibling key module
 * initializes, exercising an observable TDZ ReferenceError.
 *
 * @param {number} index
 * @returns {{files:ModuleFile[],properties:number,kind:number}}
 */
function fixture(index){
  const kind=index%10;
  const field='private_'+random().toString(16)+'_'+index;
  const value=(random()%1000)+1;
  const literal=JSON.stringify(field);
  let owner='export const bag={'+literal+':'+value+',otherField:3};';
  let key='export const key='+literal+';';
  let imports='import {bag} from "./state.mjs";import {key} from "./key.mjs";';
  let main='';
  /** @type {ModuleFile[]} */
  const extra=[];
  if(kind===0) {
    main=imports+'const alias=bag;console.log(alias[key]+bag.otherField);';
  } else if(kind===1) {
    main=imports+'const forward=x=>x;const alias=forward(bag);'+
      'console.log(alias[key]+bag.otherField);';
  } else if(kind===2) {
    key='await Promise.resolve();'+key;
    extra.push({path:'identity.mjs',sourceType:'module',code:
      'export const identity=x=>x;'});
    main=imports+'import {identity} from "./identity.mjs";'+
      'const alias=identity(bag);console.log(alias[key]+bag.otherField);';
  } else if(kind===3) {
    owner='import {probe} from "./main.mjs";'+owner+
      'try{console.log(probe());}catch(error){console.log(error.name);}';
    main=imports+'export function probe(){return bag[key];}'+
      'console.log(bag.otherField,bag[key]);';
  } else if(kind===4) {
    key='export const source='+literal+';export const key=source;';
    main=imports+'console.log(bag[key]+bag.otherField);';
  } else if(kind===5) {
    main=imports+'console.log(Object.keys(bag).length,bag[key]+bag.otherField);';
  } else if(kind===6) {
    key='const hidden='+literal+';export {hidden as key};';
    main=imports+'const alias=bag;console.log(alias[key]+bag.otherField);';
  } else if(kind===7) {
    key='let hidden='+literal+';export {hidden as key};';
    main=imports+'console.log(bag[key]+bag.otherField);';
  } else if(kind===8) {
    owner='const hidden='+literal+';export {hidden as key};'+owner;
    key='export const unrelated=1;';
    imports='import {bag,key} from "./state.mjs";';
    main=imports+'const alias=bag;console.log(alias[key]+bag.otherField);';
  } else {
    owner=owner+'const hidden='+literal+';export {hidden as key};';
    key='export const unrelated=1;';
    imports='import {bag,key} from "./state.mjs";';
    main=imports+'console.log(bag[key]+bag.otherField);';
  }
  return {kind,properties:kind<3||kind===6||kind===8?2:0,files:[
    {path:'state.mjs',sourceType:'module',code:owner},
    {path:'key.mjs',sourceType:'module',code:key},
    ...extra,
    {path:'main.mjs',sourceType:'module',code:main}
  ]};
}

/**
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} directory
 * @returns {Promise<string>}
 */
async function execute(files,directory){
  for(const file of files) {
    await atomicWrite(path.join(directory,file.path),file.code);
  }
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/**
 * Native Node ESM differential, conservative refusal, and a source-only
 * reconstruction demonstration against every accepted hashed-key graph.
 * @param {number} [cases]
 * @returns {Promise<{seed:string,cases:number,accepted:number,declined:number,normalized:number}>}
 */
async function run(cases=60){
  if(!Number.isSafeInteger(cases)||cases<6||cases>600){
    throw new TypeError('cases must be an integer between 6 and 600');
  }
  state=seed;
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-third-key-fuzz-'));
  let accepted=0,declined=0,normalized=0;
  try{
    for(let index=0;index<cases;index++){
      const current=fixture(index);
      const original=await execute(current.files,directory);
      const output=obfuscateFiles(current.files,{
        mode:'coo',seed:'third-key-graph/'+index,
        closedWorld:true,strings:false,identifiers:false
      });
      assert.equal(output.crossFile.properties,current.properties,
        'case '+index+' kind '+current.kind+' metrics '+JSON.stringify(output.crossFile));
      assert.equal(await execute(output.files,directory),original,
        'compiled ESM observation differs for case '+index);
      if(current.properties){
        accepted++;
        const recovered=neutralizeHashedNames(output.files);
        assert.equal(recovered.properties,current.properties,
          'static source normalization failed for case '+index);
        assert.equal(await execute(recovered.files,directory),original,
          'normalized ESM observation differs for case '+index);
        normalized++;
      }else declined++;
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
  return {seed:'0x'+seed.toString(16),cases,accepted,declined,normalized};
}

if(require.main===module)run().then(value=>console.log(JSON.stringify(value,null,2)))
  .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,fixture};
