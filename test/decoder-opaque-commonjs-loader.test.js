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
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {CommonJsFile[]} external
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files,external){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-opaque-require-'));
  try{
    for(const file of [...files,...external])await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:10000
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

const mutator={path:'side.cjs',sourceType:/** @type {const} */('commonjs'),
  code:'String.fromCharCode=()=>"?";'};

for(const [name,source] of [
  ['captured require value',
    'const load=require;load("./side.cjs");'+
    'process.stdout.write(load("./target.cjs"));'],
  ['node:module createRequire loader',
    'const {createRequire}=require("node:module");'+
    'const load=createRequire(__filename);load("./side.cjs");'+
    'process.stdout.write(load("./target.cjs"));'],
  ['bound module.require loader',
    'const load=module.require.bind(module);load("./side.cjs");'+
    'process.stdout.write(load("./target.cjs"));']
]) {
  test('opaque CommonJS loader cannot silently corrupt decoder: '+name,async()=>{
    const files=[
      {path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),code:source},
      {path:'target.cjs',sourceType:/** @type {const} */('commonjs'),
        code:"module.exports='protected-literal-value';"}
    ];
    const native=await execute(files,[mutator]);
    assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
    for(const mode of /** @type {const} */ (['coo','sno'])){
      const emitted=obfuscateFiles(files,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'opaque-commonjs-loader/'+name+'/'+mode
      });
      assert.deepEqual(await execute(emitted.files,[mutator]),native,
        mode+' changed runtime string value after an opaque CJS module load');
      assert.equal(emitted.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
    }
  });
}
