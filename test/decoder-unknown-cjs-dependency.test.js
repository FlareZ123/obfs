'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * The externally supplied dependency is deployed in the same execution
 * directory but intentionally omitted from the compiler input.
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} compiled
 * @param {CommonJsFile[]} extra
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(compiled,extra) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-unlisted-cjs-'));
  try {
    for(const file of [...compiled,...extra]) {
      await atomicWrite(path.join(directory,file.path),file.code);
    }
    const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',timeout:10000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @returns {CommonJsFile[]} */
function input() {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
}

test('unlisted CommonJS require executes mutable intrinsic side effect before decoder',async()=>{
  const extra=[{path:'side.cjs',sourceType:/** @type {const} */('commonjs'),
    code:'String.fromCharCode=()=>"?";'}];
  const native=await execute(input(),extra);
  assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const output=obfuscateFiles(input(),{
      mode,strings:true,properties:false,identifiers:false,
      seed:'unlisted-commonjs/'+mode
    });
    assert.deepEqual(await execute(output.files,extra),native,
      mode+' relied on an unlisted required dependency to preserve decoder intrinsics');
    assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
  }
});

test('fully supplied inert CommonJS require keeps string rewrite yield',async()=>{
  const provided=[
    ...input(),
    {path:'side.cjs',sourceType:'commonjs',code:'module.exports=17;'}
  ];
  const native=await execute(provided,[]);
  assert.equal(native.status,0,native.stderr);
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const output=obfuscateFiles(provided,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'supplied-inert-commonjs/'+mode
    });
    assert.ok((output.files.find(file=>file.path==='target.cjs')?.metrics.literals??0)>0,
      mode+' lost the protected-literal positive control');
    assert.deepEqual(await execute(output.files,[]),native);
  }
});
