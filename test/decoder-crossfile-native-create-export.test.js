'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {string} root
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} entry
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(root,files,entry) {
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(root,entry)],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * @param {'cjs-direct-export'|'cjs-holder-export'|'esm-named-export'} kind
 * @param {boolean} safe
 * @returns {{files:SourceFile[],entry:string,target:string}}
 */
function sourceGraph(kind,safe) {
  const ext=kind==='esm-named-export'?'mjs':'cjs';
  const entry='entry.'+ext;
  const target='target.'+ext;
  const ctor=safe?'Number':'String';
  const write=safe?'unrelated=1;':'charCodeAt=()=>0;';
  let factory;
  let mutator;
  let entrySource;
  let targetSource;
  if(ext==='mjs'){
    factory='export const make=Object.create;';
    mutator="import {make} from './factory.mjs';"+
      'const box=make(null,{ref:{get(){return '+ctor+'.prototype}}});'+
      'box.ref.'+write;
    entrySource="import './mutator.mjs';"+
      "import {value} from './target.mjs';process.stdout.write(value);";
    targetSource='export const value='+JSON.stringify('R'.repeat(2048)+'F')+';';
  }else{
    factory=kind==='cjs-holder-export'?
      'module.exports={make:Object.create};':
      'module.exports=Object.create;';
    mutator=kind==='cjs-holder-export'?
      "const {make}=require('./factory.cjs');":
      "const make=require('./factory.cjs');";
    mutator+='const box=make(null,{ref:{get(){return '+ctor+'.prototype}}});'+
      'box.ref.'+write;
    entrySource="require('./mutator.cjs');process.stdout.write(require('./target.cjs'));";
    targetSource='module.exports='+JSON.stringify('R'.repeat(2048)+'F')+';';
  }
  return {entry,target,files:[
    {path:entry,sourceType:ext==='mjs'?'module':'commonjs',code:entrySource},
    {path:'factory.'+ext,sourceType:ext==='mjs'?'module':'commonjs',code:factory},
    {path:'mutator.'+ext,sourceType:ext==='mjs'?'module':'commonjs',code:mutator},
    {path:target,sourceType:ext==='mjs'?'module':'commonjs',code:targetSource}
  ]};
}

for(const kind of /** @type {const} */ (['cjs-direct-export','cjs-holder-export','esm-named-export'])) {
  for(const mode of (kind==='esm-named-export'?
    /** @type {const} */ (['coo']):
    /** @type {const} */ (['coo','sno','sco']))) {
    for(const safe of [false,true]) {
      test('cross-file native Object.create export '+kind+'/'+mode+'/'+
        (safe?'Number benign':'String unsafe'),async()=>{
        const {entry,target,files}=sourceGraph(kind,safe);
        const output=obfuscateFiles(files,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'exported-native-create/'+kind+'/'+mode+'/'+safe
        });
        const emitted=output.files.find(file=>file.path===target);
        assert.ok(emitted,'target must be emitted');
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-native-create-'));
        try{
          const baseline=await run(path.join(root,'native'),files,entry);
          const transformed=await run(path.join(root,'emitted'),output.files,entry);
          assert.equal(baseline.status,0,baseline.stderr);
          assert.deepEqual(transformed,baseline,
            'Cross-file exported native callable altered runtime output');
        }finally{
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(emitted.metrics.literals,safe?1:0,
          'Expected source-visible safe encoding yield boundary');
      });
    }
  }
}
