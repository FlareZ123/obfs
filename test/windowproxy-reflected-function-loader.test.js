'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-windowproxy-loader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'preload.cjs'),'globalThis.top=globalThis;');
    const child=spawnSync(process.execPath,['--require',path.join(root,'preload.cjs'),path.join(root,'entry.mjs')],{
      encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {boolean} hiddenLoader
 * @returns {SourceFile[]}
 */
function graph(hiddenLoader){
  const code=[
    "import {record} from './owner.mjs';",
    hiddenLoader?[
      "const values=Object.values(Object.getOwnPropertyDescriptors(top));",
      "const found=values.find(d=>typeof d.value==='function'&&d.value.name==='Function');",
      "const constructor=found.value;",
      "const uri=new URL('./owner.mjs',import.meta.url).href;",
      "const imported=await constructor('u','return import(u)')(uri);",
      "process.stdout.write(JSON.stringify({direct:record.secretField,keys:Object.keys(imported.record)}));"
    ].join('\n'):
      "console.log(record.secretField+globalThis.Math.max(1,2));"
  ].join('\n');
  return [
    {path:'owner.mjs',sourceType:'module',
      code:'export const record={secretField:13};'},
    {path:'entry.mjs',sourceType:'module',code}
  ];
}

/** @param {SourceFile[]} input @returns {ReturnType<typeof obfuscateFiles>} */
function compile(input){
  return obfuscateFiles(input,{mode:'coo',closedWorld:true,
    strings:false,properties:true,identifiers:false,
    seed:'windowproxy-reflected-function-constructor'});
}

test('ordinary static ESM consumer retains non-vacuous cross-file property-renaming coverage',async()=>{
  const input=graph(false);
  const compiled=compile(input);
  const native=await execute(input);
  const generated=await execute(compiled.files);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'15\n');
  assert.deepEqual(generated,native);
  assert.ok(compiled.crossFile.properties>0,
    'The baseline must actually rename an exported owner property');
});

test('reflected Function constructor through top must not hide a runtime ESM consumer',async()=>{
  const input=graph(true);
  const compiled=compile(input);
  const native=await execute(input);
  const generated=await execute(compiled.files);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'{"direct":13,"keys":["secretField"]}');
  assert.deepEqual(generated,native,
    'Runtime Function/ESM clone can inspect original exported object keys');
});
