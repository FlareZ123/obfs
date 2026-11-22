'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @param {string} dir @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files */
async function execute(dir,files) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const factories=[
  ['named export function',
    'const desc={get(){return CTOR.prototype;}};export function make(){return {ref:desc};}',
    'import {make} from "./factory.mjs";const ds=make();'],
  ['default exported arrow',
    'const desc={get(){return CTOR.prototype;}};export default ()=>({ref:desc});',
    'import make from "./factory.mjs";const ds=make();'],
  ['named exported descriptor',
    'export const desc={get(){return CTOR.prototype;}};',
    'import {desc} from "./factory.mjs";const ds={ref:desc};']
];

for(const [name,make,consume] of factories) {
  for(const sink of /** @type {const} */ (['create','defineProperties'])) {
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      for(const safe of [false,true]) {
        test('ESM cross-module getter export: '+name+'/'+sink+'/'+mode+'/'+
          (safe?'Number positive':'String unsafe'),async()=>{
          const ctor=safe?'Number':'String';
          const mutator=consume+
            (sink==='create'?'const box=Object.create(null,ds);':
              'const box={};Object.defineProperties(box,ds);')+
            'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
          /** @type {SourceFile[]} */
          const input=[
            {path:'entry.mjs',sourceType:'module',
              code:'import "./mutator.mjs";import target from "./target.mjs";process.stdout.write(target);'},
            {path:'factory.mjs',sourceType:'module',code:make.replace('CTOR',ctor)},
            {path:'mutator.mjs',sourceType:'module',code:mutator},
            {path:'target.mjs',sourceType:'module',
              code:'export default '+JSON.stringify('J'.repeat(2048)+'V')+';'}
          ];
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'esm-getter-export/'+name+'/'+sink+'/'+mode+'/'+safe
          });
          const target=output.files.find(f=>f.path==='target.mjs');
          assert.ok(target);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-desc-'));
          try {
            const native=await execute(path.join(root,'native'),input);
            const emitted=await execute(path.join(root,'emitted'),output.files);
            assert.equal(native.status,0,native.stderr);
            assert.equal(emitted.status,native.status,emitted.stderr);
            assert.equal(emitted.stderr,native.stderr);
            assert.ok(emitted.stdout===native.stdout,
              'stdout emitted='+digest(emitted.stdout)+' native='+digest(native.stdout));
          } finally {
            await fs.rm(root,{recursive:true,force:true});
          }
          assert.equal(target.metrics.literals,safe?1:0,'unexpected ESM decoder yield');
        });
      }
    }
  }
}
