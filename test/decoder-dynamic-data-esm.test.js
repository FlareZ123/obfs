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

/**
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-module-intrinsic-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} body
 * @returns {ModuleFile[]}
 */
function graph(body){
  return [
    {path:'entry.mjs',sourceType:'module',code:body},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

const patch='String.fromCharCode=()=>"?";';
const url='data:text/javascript,'+encodeURIComponent(patch);

test('dynamic data: ESM import before target preserves String decoder parity',async()=>{
  const input=graph(
    'await import('+JSON.stringify(url)+');'+
    'const {default:value}=await import("./target.mjs");process.stdout.write(value);'
  );
  const native=await execute(input);
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'dynamic-data-esm-intrinsic/'+mode
    });
    assert.deepEqual(await execute(output.files),native,
      mode+' changed exported value after a dynamic data: module modified String');
    assert.equal(output.files.find(file=>file.path==='target.mjs')?.metrics.literals,0,
      mode+' encoded a string without proving earlier dynamic import effects');
  }
});

test('no dynamic import retains string encoding on the target leaf',async()=>{
  const input=graph(
    'const {default:value}=await import("./target.mjs");process.stdout.write(value);'
  );
  const native=await execute(input);
  assert.equal(native.status,0,native.stderr);
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'dynamic-data-esm-intrinsic/positive/'+mode
    });
    assert.ok((output.files.find(file=>file.path==='target.mjs')?.metrics.literals??0)>0,
      mode+' lost encoding coverage for an ordinary local ESM leaf');
    assert.deepEqual(await execute(output.files),native);
  }
});
