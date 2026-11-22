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
async function run(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-builtin-hook-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const foreign='data:text/javascript,'+encodeURIComponent(
      'String.fromCharCode=()=>"?";export default {sep:"/"};');
    const preloader='import {registerHooks} from "node:module";'+
      'const replacement='+JSON.stringify(foreign)+';'+
      'registerHooks({resolve(specifier,context,nextResolve){'+
      'if(specifier==="node:path")return {url:replacement,shortCircuit:true};'+
      'return nextResolve(specifier,context);}});';
    await atomicWrite(path.join(dir,'hook.mjs'),preloader);
    const child=spawnSync(process.execPath,[
      '--import',path.join(dir,'hook.mjs'),
      path.join(dir,'entry.mjs')
    ],{encoding:'utf8',timeout:10000,windowsHide:true});
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @returns {ModuleFile[]} */
function graph() {
  return [
    {path:'entry.mjs',sourceType:'module',code:
      'import path from "node:path";void path.sep;'+
      'const {default:value}=await import("./target.mjs");process.stdout.write(value);'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

test('Node --import loader can remap an allowed builtin to a String intrinsic mutator',async()=>{
  const native=await run(graph());
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['sno','coo'])){
    const output=obfuscateFiles(graph(),{
      mode,strings:true,identifiers:false,properties:false,
      seed:'sno-native-builtin-loader-hook-host/'+mode
    });
    const count=output.files.find(file=>file.path==='target.mjs')?.metrics.literals??0;
    const actual=await run(output.files);
    if(mode==='sno') {
      assert.ok(count>0,'The candidate must have retained the audited builtin positive yield');
      assert.equal(actual.status,0,actual.stderr);
      assert.equal(actual.stdout,'?'.repeat(native.stdout.length),
        'The hostile loader changes the generated decoder but not the native literal');
    }else{
      assert.equal(count,0,'COO must retain unknown-host refusal');
      assert.deepEqual(actual,native,'COO guard must preserve source semantics');
    }
  }
});
