'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
const payload='Z'.repeat(2048)+'E';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-proto-esm-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const p=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      windowsHide:true,encoding:'utf8',timeout:15000
    });
    if(p.error)throw p.error;
    return {status:p.status,stdout:p.stdout,stderr:p.stderr};
  }finally{
    await fs.rm(dir,{force:true,recursive:true});
  }
}

/** @param {string} side @returns {SourceFile[]} */
function input(side){
  return [
    {path:'side.mjs',sourceType:'module',code:side},
    {path:'target.mjs',sourceType:'module',
      code:'export const payload='+JSON.stringify(payload)+';'},
    {path:'entry.mjs',sourceType:'module',code:
      "import './side.mjs';import {payload} from './target.mjs';process.stdout.write(payload);"}
  ];
}

for(const [name,mutator,expectedYield] of [
  ['JSON.stringify primitive', 'const p=(JSON.stringify(0)).__proto__;p.charCodeAt=()=>0;',0],
  ['String.raw tag', 'const p=(String.raw`ok`).__proto__;p.charCodeAt=()=>0;',0],
  ['String literal prototype via variable',
    "const raw=JSON.stringify(42);const p=raw.__proto__;p.charCodeAt=()=>0;",0],
  ['read-only alias',
    "const p=(JSON.stringify(0)).__proto__;const reader=p.charCodeAt;",1],
  ['unrelated alias field',
    "const p=(JSON.stringify(0)).__proto__;p.unrelatedAppField=5;",1]
]){
  for(const mode of /** @type {const} */ (['coo','sno'])){
    test('ESM dependency-evaluation primitive prototype '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const files=input(mutator);
      const native=await execute(files);
      assert.equal(native.status,0,native.stderr);
      assert.equal(native.stdout,payload);
      const result=obfuscateFiles(files,{
        mode,seed:'agent9-esm-dynamic-proto/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      const target=result.files.find(file=>file.path==='target.mjs');
      assert.equal(target?.metrics.literals,expectedYield,
        name+'/'+mode+' must preserve precise decoder eligibility');
      const transformed=await execute(result.files);
      assert.equal(transformed.status,native.status,transformed.stderr);
      const digest=/** @param {string} value @returns {string} */ value=>
        createHash('sha256').update(value).digest('hex');
      assert.equal(digest(transformed.stdout),digest(native.stdout),
        name+'/'+mode+' altered ESM module execution output');
    });
  }
}
