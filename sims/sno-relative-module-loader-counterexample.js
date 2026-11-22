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

/** @returns {ModuleFile[]} */
function graph(){
  return [
    {path:'entry.mjs',sourceType:'module',
      code:'import "./side.mjs";'+
        'const {default:value}=await import("./target.mjs");process.stdout.write(value);'},
    {path:'side.mjs',sourceType:'module',code:'export const inert=17;'},
    {path:'target.mjs',sourceType:'module',code:"export default 'protected-literal-value';"}
  ];
}

/**
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-relative-resolve-hook-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const forged='data:text/javascript,'+encodeURIComponent(
      'String.fromCharCode=()=>"?";export const forged=true;');
    const hook='import {registerHooks} from "node:module";'+
      'const forged='+JSON.stringify(forged)+';'+
      'registerHooks({resolve(specifier,context,nextResolve){'+
      'if(specifier==="./side.mjs")return {url:forged,shortCircuit:true};'+
      'return nextResolve(specifier,context);}});';
    await atomicWrite(path.join(directory,'preload.mjs'),hook);
    const child=spawnSync(process.execPath,[
      '--import',pathToFileURL(path.join(directory,'preload.mjs')).href,
      path.join(directory,'entry.mjs')
    ],{encoding:'utf8',timeout:10000,windowsHide:true});
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('external loader can redirect an apparently complete static relative ESM graph',async()=>{
  const original=graph();
  const native=await execute(original);
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['sno','coo'])){
    const transformed=obfuscateFiles(original,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'host-relative-node-loader-graph/'+mode
    });
    const count=transformed.files.find(file=>file.path==='target.mjs')?.metrics.literals??0;
    assert.ok(count>0,'Expected true encoding in syntactically complete input graph: '+mode);
    const emitted=await execute(transformed.files);
    assert.equal(emitted.status,0,emitted.stderr);
    assert.equal(emitted.stdout,'?'.repeat(native.stdout.length),
      'Host loader must demonstrate corruption of generated ambient decoder');
    console.log('RELATIVE_NODE_HOOK_COUNTEREXAMPLE '+
      JSON.stringify({mode,native:native.stdout,emitted:emitted.stdout,encodedLiterals:count}));
  }
});
