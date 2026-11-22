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
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-esm-native-import-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} prefix
 * @returns {ModuleFile[]}
 */
function graph(prefix) {
  return [
    {path:'entry.mjs',sourceType:'module',code:prefix+
      'const {default:value}=await import("./target.mjs");process.stdout.write(value);'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

const patch=JSON.stringify('String.fromCharCode=()=>"?";');
const cases=[
  {name:'node:path static default import',prefix:
    'import path from "node:path";void path.sep;',safe:true},
  {name:'bare os builtin static import',prefix:
    'import os from "os";void os.arch();',safe:true},
  {name:'node:fs native source-reader import',prefix:
    'import fs from "node:fs";void fs.constants;',safe:false},
  {name:'node:vm in-context mutation',prefix:
    'import vm from "node:vm";vm.runInThisContext('+patch+');',safe:false}
];

for(const item of cases) {
  test('SNO static builtin ESM source contract: '+item.name,async()=>{
    const source=graph(item.prefix);
    const native=await execute(source);
    assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const protectedGraph=obfuscateFiles(source,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'sno-native-builtin-esm/'+item.name+'/'+mode
      });
      const emitted=await execute(protectedGraph.files);
      assert.deepEqual(emitted,native,mode+' mutated behavior: '+item.name);
      const count=protectedGraph.files.find(file=>file.path==='target.mjs')?.metrics.literals??0;
      if(item.safe&&mode==='sno'){
        assert.ok(count>0,'Trusted Node-native inert import should retain target decoding');
      }else{
        assert.equal(count,0,mode+' must not encode in this unproved host/import case');
      }
    }
  });
}
