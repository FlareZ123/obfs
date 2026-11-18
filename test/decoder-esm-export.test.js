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

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * @param {string} holder
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function graph(holder,mutator) {
  return [
    {path:'entry.mjs',sourceType:'module',
      code:"import './mutator.mjs';import value from './target.mjs';process.stdout.write(value);"},
    {path:'holder.mjs',sourceType:'module',code:holder},
    {path:'mutator.mjs',sourceType:'module',code:mutator},
    {path:'target.mjs',sourceType:'module',
      code:'export default '+JSON.stringify('M'.repeat(2048)+'Q')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['default exported object field',
    "export default {ref:String.prototype};",
    "import box from './holder.mjs';function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['named exported prototype',
    "export const ref=String.prototype;",
    "import {ref} from './holder.mjs';function poison(p){p.charCodeAt=()=>0;}poison(ref);"],
  ['default exported String constructor',
    "export default String;",
    "import C from './holder.mjs';function poison(v){v.fromCharCode=()=>'?';}poison(C);"],
  ['exported local alias',
    "const p=String.prototype;export {p as ref};",
    "import {ref} from './holder.mjs';function poison(p){p.charCodeAt=()=>0;}poison(ref);"]
];

for(const [name,holder,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('ESM exported intrinsic must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(holder,mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-esm-export/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-decoder-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'ESM export erased mutable decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.mjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['default exported Number object field',
    "export default {ref:Number.prototype};",
    "import box from './holder.mjs';function write(p){p.unrelated=1;}write(box.ref);"],
  ['named exported Number prototype',
    "export const ref=Number.prototype;",
    "import {ref} from './holder.mjs';function write(p){p.unrelated=1;}write(ref);"],
  ['default exported Number constructor',
    "export default Number;",
    "import C from './holder.mjs';function write(v){v.fromCharCode=()=>'?';}write(C);"],
  ['exported local Number alias',
    "const p=Number.prototype;export {p as ref};",
    "import {ref} from './holder.mjs';function write(p){p.unrelated=1;}write(ref);"]
];

for(const [name,holder,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe ESM Number export keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(holder,mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-esm-export/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.mjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-decoder-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
