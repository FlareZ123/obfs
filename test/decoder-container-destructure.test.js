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

/**
 * @param {string} source
 * @returns {SourceFile[]}
 */
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
  ['named object destructure',
    "function poison(p){p.charCodeAt=()=>0;}const box={ref:String.prototype};const {ref}=box;poison(ref);"],
  ['named array destructure',
    "function poison(p){p.charCodeAt=()=>0;}const box=[String.prototype];const [ref]=box;poison(ref);"],
  ['direct object literal destructure',
    "function poison(p){p.charCodeAt=()=>0;}const {ref}={ref:String.prototype};poison(ref);"],
  ['direct array literal destructure',
    "function poison(p){p.charCodeAt=()=>0;}const [ref]=[String.prototype];poison(ref);"],
  ['object destructuring assignment',
    "function poison(p){p.charCodeAt=()=>0;}const box={ref:String.prototype};let ref;({ref}=box);poison(ref);"],
  ['named object String constructor destructure',
    "function poison(C){C.fromCharCode=()=>'?';}const box={ref:String};const {ref}=box;poison(ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('destructured container intrinsic must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-container-destructure/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-container-destructure-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Destructuring erased mutable decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['named object safe sibling',
    "function write(p){p.unrelated=1;}const box={hot:String.prototype,safe:Number.prototype};const {safe}=box;write(safe);"],
  ['named array safe sibling',
    "function write(p){p.unrelated=1;}const box=[String.prototype,Number.prototype];const [,safe]=box;write(safe);"],
  ['direct object Number destructure',
    "function write(p){p.unrelated=1;}const {ref}={ref:Number.prototype};write(ref);"],
  ['direct array Number destructure',
    "function write(p){p.unrelated=1;}const [ref]=[Number.prototype];write(ref);"],
  ['object assignment safe sibling',
    "function write(p){p.unrelated=1;}const box={hot:String.prototype,safe:Number.prototype};let safe;({safe}=box);write(safe);"],
  ['named object Number constructor destructure',
    "function write(C){C.fromCharCode=()=>'?';}const box={ref:Number};const {ref}=box;write(ref);"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe destructured Number value keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-container-destructure/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-container-destructure-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
