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
async function execute(root,files,entry) {
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(root,entry)],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * A factory module exports a bound native Object.create with its prototype
 * argument already supplied. The consuming module supplies the descriptor map
 * as argument zero, not argument one.
 *
 * @param {'cjs-direct'|'cjs-holder'|'esm-named'} kind
 * @param {boolean} safe
 * @returns {{files:SourceFile[],entry:string,target:string}}
 */
function sourceGraph(kind,safe) {
  const esm=kind==='esm-named';
  const ext=esm?'mjs':'cjs';
  const entry='entry.'+ext;
  const target='target.'+ext;
  const ctor=safe?'Number':'String';
  const write=safe?'unrelated=1;':'charCodeAt=()=>0;';
  const factory=kind==='cjs-holder'?
    'module.exports={make:Object.create.bind(null,null)};':
    esm?'export const make=Object.create.bind(null,null);':
      'module.exports=Object.create.bind(null,null);';
  const mutator=esm?
    "import {make} from './factory.mjs';":
    kind==='cjs-holder'?"const {make}=require('./factory.cjs');":
      "const make=require('./factory.cjs');";
  const mutate=mutator+
    'const box=make({ref:{get(){return '+ctor+'.prototype}}});'+
    'box.ref.'+write;
  const entrySource=esm?
    "import './mutator.mjs';import {value} from './target.mjs';process.stdout.write(value);":
    "require('./mutator.cjs');process.stdout.write(require('./target.cjs'));";
  const targetSource=esm?
    'export const value='+JSON.stringify('R'.repeat(2048)+'F')+';':
    'module.exports='+JSON.stringify('R'.repeat(2048)+'F')+';';
  return {entry,target,files:[
    {path:entry,sourceType:esm?'module':'commonjs',code:entrySource},
    {path:'factory.'+ext,sourceType:esm?'module':'commonjs',code:factory},
    {path:'mutator.'+ext,sourceType:esm?'module':'commonjs',code:mutate},
    {path:target,sourceType:esm?'module':'commonjs',code:targetSource}
  ]};
}

for(const kind of /** @type {const} */ (['cjs-direct','cjs-holder','esm-named'])) {
  const modes=kind==='esm-named'?['coo']:['coo','sno','sco'];
  for(const mode of modes) {
    for(const safe of [false,true]) {
      test('cross-file bound native Object.create export '+kind+'/'+mode+'/'+
        (safe?'Number benign':'String unsafe'),async()=>{
        const {entry,target,files}=sourceGraph(kind,safe);
        const output=obfuscateFiles(files,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'bound-exported-native-create/'+kind+'/'+mode+'/'+safe
        });
        const emitted=output.files.find(file=>file.path===target);
        assert.ok(emitted,'target must be emitted');
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-exported-create-'));
        try {
          const native=await execute(path.join(root,'native'),files,entry);
          const transformed=await execute(path.join(root,'emitted'),output.files,entry);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(transformed,native,
            'Cross-file bound native callable altered runtime output');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(emitted.metrics.literals,safe?1:0,
          'Sensitive bound descriptor must be refused while benign yield remains');
      });
    }
  }
}
