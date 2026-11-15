'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('./offline-normalize');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
const seed=0x153f04a9;
let randomState=seed;

/** @returns {number} */
function random() {
  randomState^=randomState<<13;
  randomState^=randomState>>>17;
  randomState^=randomState<<5;
  return randomState>>>0;
}

/** @param {ModuleFile[]} files @param {string} directory */
async function execute(files,directory) {
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/** @param {string} key @param {number} value @param {boolean} positive @returns {ModuleFile[]} */
function fixture(key,value,positive) {
  const other='guardField',q=JSON.stringify(key);
  const state=positive ?
    `export const fieldKey=${q};export const owner={${q}:${value},${other}:3};` :
    `export const owner={${q}:${value},${other}:3};export const fieldKey=${q};`;
  const variant=random()%4;
  const main=variant%2===0?
    'import {owner as bag,fieldKey as key} from "./state.mjs";'+
      'const alias=bag;globalThis[key]=7;'+
      'alias[key]+=2;console.log(alias[key]+bag.guardField,globalThis[key]);' :
    'import {owner,fieldKey} from "./state.mjs";'+
      'const alias=owner;globalThis[fieldKey]=7;'+
      'alias[fieldKey]+=2;console.log(alias[fieldKey]+owner.guardField,globalThis[fieldKey]);';
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'main.mjs',sourceType:'module',code:main}
  ];
}

/** @param {number} [cases] @returns {Promise<object>} */
async function run(cases=32) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-imported-fuzz-'));
  let positives=0,declined=0,normalized=0;
  try {
    for(let index=0;index<cases;index++){
      const value=random()%201;
      const name='private_'+(random()%100000).toString(16)+'_'+index;
      const positive=index%4!==3;
      const original=fixture(name,value,positive);
      const expected=await execute(original,dir);
      const result=obfuscateFiles(original,{mode:'coo',seed:'imported-key-fuzz/'+index,
        closedWorld:true,strings:false,identifiers:false});
      const required=positive?2:0;
      assert.equal(result.crossFile.properties,required,
        'case '+index+' result '+JSON.stringify(result.crossFile));
      assert.equal(await execute(/** @type {ModuleFile[]} */ (result.files),dir),expected,
        'case '+index+' compiled output differs');
      if(positive){
        positives++;
        const neutralized=neutralizeHashedNames(result.files);
        assert.equal(neutralized.properties,2);
        assert.equal(await execute(/** @type {ModuleFile[]} */ (neutralized.files),dir),expected);
        normalized++;
      }else declined++;
    }
  }finally{await fs.rm(dir,{force:true,recursive:true});}
  return {seed:'0x'+seed.toString(16),cases,positives,declined,normalized};
}

if(require.main===module)run().then(result=>console.log(JSON.stringify(result,null,2)))
  .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
