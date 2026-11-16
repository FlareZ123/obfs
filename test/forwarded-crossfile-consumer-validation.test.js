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
 * Run the real three-module ESM entry in a fresh Node process.
 * @param {ReturnType<typeof obfuscateFiles>['files']|{path:string,code:string,sourceType:'module'}[]} files
 * @param {string} folder
 * @returns {Promise<string>}
 */
async function execute(files,folder) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(folder,'main.mjs')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

/**
 * Imported identity calls produce direct member receivers in another module.
 * @param {string} entry
 * @param {number} expectedRenamedProperties
 */
async function compare(entry,expectedRenamedProperties) {
  const original=/** @type {{path:string,code:string,sourceType:'module'}[]} */ ([
    {path:'state.mjs',sourceType:'module',code:'export const root={secretField:13};'},
    {path:'identity.mjs',sourceType:'module',code:'export function identity(value){return value;}'},
    {path:'main.mjs',sourceType:'module',
      code:'import {root} from "./state.mjs";import {identity} from "./identity.mjs";'+entry}
  ]);
  const transformed=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'cross-forwarded-consumer',strings:false,identifiers:false
  });
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-forwarded-esm-'));
  try{
    const nativeDirectory=path.join(temporary,'native');
    const emittedDirectory=path.join(temporary,'emitted');
    await fs.mkdir(nativeDirectory);
    await fs.mkdir(emittedDirectory);
    const native=await execute(original,nativeDirectory);
    const emitted=await execute(transformed.files,emittedDirectory);
    assert.equal(emitted,native,transformed.files.map(f=>f.code).join('\n'));
    assert.equal(transformed.crossFile.properties,expectedRenamedProperties,
      transformed.files.map(f=>f.code).join('\n'));
  }finally{
    await fs.rm(temporary,{recursive:true,force:true});
  }
}

test('ESM imported identity safe read remains positively renameable',async()=>{
  await compare('console.log(identity(root).secretField+4);',1);
});

test('ESM imported identity member as invalid callee preserves caught TypeError',async()=>{
  await compare('let result;try{identity(root).secretField();}'+
    'catch(error){result=error.message;}console.log(result);',0);
});

test('ESM imported identity member cannot install reflective function',async()=>{
  await compare('identity(root).secretField=function(){return Object.keys(this)[0];};'+
    'console.log(identity(root).secretField());',0);
});
