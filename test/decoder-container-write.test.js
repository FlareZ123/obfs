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
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} source @returns {SourceFile[]} */
function graph(source) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:source},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('M'.repeat(2048)+'Q')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['post-construction object field',
    "const box={};box.ref=String.prototype;function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['post-construction array slot',
    "const box=[];box[0]=String.prototype;function poison(p){p.charCodeAt=()=>0;}poison(box[0]);"],
  ['post-construction nested object field',
    "const box={inner:{}};box.inner.ref=String.prototype;function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['post-construction object String constructor',
    "const box={};box.ref=String;function poison(C){C.fromCharCode=()=>'?';}poison(box.ref);"],
  ['static computed field',
    "const box={};box['ref']=String.prototype;function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['nested object then array slot',
    "const box={inner:[]};box.inner[0]=String.prototype;function poison(p){p.charCodeAt=()=>0;}poison(box.inner[0]);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('post-construction sensitive field must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-container-write/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-container-write-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Post-construction field write erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['post-construction object Number field',
    "const box={};box.ref=Number.prototype;function write(p){p.unrelated=1;}write(box.ref);"],
  ['post-construction array Number slot',
    "const box=[];box[0]=Number.prototype;function write(p){p.unrelated=1;}write(box[0]);"],
  ['post-construction nested Number field',
    "const box={inner:{}};box.inner.ref=Number.prototype;function write(p){p.unrelated=1;}write(box.inner.ref);"],
  ['post-construction Number constructor',
    "const box={};box.ref=Number;function write(C){C.fromCharCode=()=>'?';}write(box.ref);"],
  ['mixed written safe sibling',
    "const box={};box.hot=String.prototype;box.safe=Number.prototype;function write(p){p.unrelated=1;}write(box.safe);"],
  ['nested mixed written safe sibling',
    "const box={inner:{}};box.inner.hot=String.prototype;box.inner.safe=Number.prototype;function write(p){p.unrelated=1;}write(box.inner.safe);"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe post-construction Number field keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-container-write/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-container-write-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
