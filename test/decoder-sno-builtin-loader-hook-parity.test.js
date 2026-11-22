'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
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
      '--import',pathToFileURL(path.join(dir,'hook.mjs')).href,
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

test('SNO/COO refuse decoder for Node builtin remapped by --import loader',async()=>{
  const native=await run(graph());
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['sno','coo'])){
    const output=obfuscateFiles(graph(),{
      mode,strings:true,identifiers:false,properties:false,
      seed:'sno-native-builtin-loader-hook-host/'+mode
    });
    const count=output.files.find(file=>file.path==='target.mjs')?.metrics.literals??0;
    const actual=await run(output.files);
    assert.equal(count,0,mode+' must refuse encoding for a host-remappable builtin');
    assert.deepEqual(actual,native,
      mode+' changed the native literal under identical Node module loader hooks');
  }
});
