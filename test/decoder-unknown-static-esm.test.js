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
 * The extra module exists at runtime, but is intentionally not provided to
 * the compiler. It models a deployed or host-provided dependency.
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} compiled
 * @param {ModuleFile[]} extra
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(compiled,extra){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-outside-static-esm-'));
  try{
    for(const file of [...compiled,...extra]) {
      await atomicWrite(path.join(directory,file.path),file.code);
    }
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @returns {ModuleFile[]} */
function input(){
  return [
    {path:'entry.mjs',sourceType:'module',code:
      'import "./side.mjs";'+
      'const {default:value}=await import("./target.mjs");process.stdout.write(value);'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

test('unlisted static ESM dependency can mutate later decoder intrinsic',async()=>{
  const extra=[{path:'side.mjs',sourceType:/** @type {const} */('module'),
    code:'String.fromCharCode=()=>"?";'}];
  const native=await execute(input(),extra);
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles(input(),{
      mode,strings:true,properties:false,identifiers:false,
      seed:'unlisted-static-esm/'+mode
    });
    assert.deepEqual(await execute(output.files,extra),native,
      mode+' relied on an unproved static dependency not supplied to the compiler');
    assert.equal(output.files.find(file=>file.path==='target.mjs')?.metrics.literals,0,
      'Unknown earlier dependency must preclude ambient String decoder');
  }
});

test('complete static ESM graph with inert dependency retains positive yield',async()=>{
  const safe=[
    ...input(),
    {path:'side.mjs',sourceType:'module',code:'export const inert=17;'}
  ];
  const native=await execute(safe,[]);
  assert.equal(native.status,0,native.stderr);
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles(safe,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'in-graph-static-esm/'+mode
    });
    assert.ok((output.files.find(file=>file.path==='target.mjs')?.metrics.literals??0)>0,
      'Complete inert static dependency should keep encoding enabled');
    assert.deepEqual(await execute(output.files,[]),native);
  }
});

test('repeated-separator ESM URL alias disables the ambient String decoder',async()=>{
  const files=[
    {path:'entry.mjs',sourceType:'module',
      code:'import "./a//../side.mjs";'+
        'const {default:value}=await import("./target.mjs");process.stdout.write(value);'},
    {path:'side.mjs',sourceType:'module',code:'export const inert=17;'},
    {path:'target.mjs',sourceType:'module',code:"export default 'protected-literal-value';"}
  ];
  const extra=[{path:'a/side.mjs',sourceType:/** @type {const} */('module'),
    code:'String.fromCharCode=()=>"?";'}];
  const native=await execute(files,extra);
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles(files,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'repeated-separator-esm/'+mode
    });
    assert.equal(output.files.find(file=>file.path==='target.mjs')?.metrics.literals,0,
      'A path that may resolve outside the declared graph must preclude decoder injection');
    assert.deepEqual(await execute(output.files,extra),native,
      mode+' must not initialize a String decoder before the actual URL-resolved dependency');
  }
});
