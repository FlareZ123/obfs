'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

const hostRunner=[
  'import {get,read} from "./owner.mjs";',
  'console.log(JSON.stringify({privateGet:get(),external:String(read({secretAlpha:71})),',
  '  readableSource:read.toString().includes("secretAlpha")}));'
].join('\n');

/** @type {SourceFile[]} */
const files=[{path:'owner.mjs',sourceType:'module',code:[
  'const privateRecord={secretAlpha:23};',
  'export const read=(input)=>{const value=input.secretAlpha;return value;};',
  'export const get=()=>read(privateRecord);'
].join('\n')} ];

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} sources
 * @returns {Promise<{privateGet:number,external:string,readableSource:boolean}>}
 */
async function execute(sources){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-helper-host-'));
  try{
    for(const file of sources)await atomicWrite(path.join(folder,file.path),file.code);
    await atomicWrite(path.join(folder,'host-runner.mjs'),hostRunner);
    const child=spawnSync(process.execPath,[path.join(folder,'host-runner.mjs')],{
      cwd:folder,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const guarded=process.argv.includes('--expect-guarded');
  const native=await execute(files);
  assert.deepEqual(native,{privateGet:23,external:'71',readableSource:true});
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const output=obfuscateFiles(files,{
      mode,closedWorld:false,strings:false,identifiers:false,seed:'exported-reader-'+mode
    });
    const transformed=await execute(output.files);
    if(guarded){
      assert.equal(output.files[0].metrics.properties,0,
        mode+': public callable may receive unknown host record');
      assert.deepEqual(transformed,native);
    }else{
      assert.equal(output.files[0].metrics.properties,1,
        mode+': counterexample requires an actually rewritten own key');
      assert.equal(transformed.privateGet,native.privateGet);
      assert.equal(transformed.external,'undefined',
        mode+': published private spelling changes externally supplied object read');
      assert.equal(transformed.readableSource,false);
    }
    console.log('EXPORTED_READER_HOST_ARGUMENT '+JSON.stringify({
      mode,status:guarded?'guarded':'observable-behavior-change',
      transformedProperties:output.files[0].metrics.properties,
      native,transformed
    }));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
