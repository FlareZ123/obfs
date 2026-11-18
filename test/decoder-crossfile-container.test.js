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
 * @param {string} holder
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function graph(holder,mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'holder.cjs',sourceType:'commonjs',code:holder},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('M'.repeat(2048)+'Q')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['exported object field String prototype',
    "module.exports={ref:String.prototype};",
    "const box=require('./holder.cjs');function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['exports field String prototype',
    "exports.ref=String.prototype;",
    "const box=require('./holder.cjs');function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['exported object field String constructor',
    "module.exports={ref:String};",
    "const box=require('./holder.cjs');function poison(C){C.fromCharCode=()=>'?';}poison(box.ref);"],
  ['directly exported String prototype',
    "module.exports=String.prototype;",
    "const p=require('./holder.cjs');function poison(v){v.charCodeAt=()=>0;}poison(p);"]
];

for(const [name,holder,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('cross-file exported intrinsic must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(holder,mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-crossfile-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-crossfile-decoder-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'CommonJS export erased mutable decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['exported object field Number prototype',
    "module.exports={ref:Number.prototype};",
    "const box=require('./holder.cjs');function write(p){p.unrelated=1;}write(box.ref);"],
  ['exports field Number prototype',
    "exports.ref=Number.prototype;",
    "const box=require('./holder.cjs');function write(p){p.unrelated=1;}write(box.ref);"],
  ['exported object field Number constructor',
    "module.exports={ref:Number};",
    "const box=require('./holder.cjs');function write(C){C.fromCharCode=()=>'?';}write(box.ref);"],
  ['directly exported Number prototype',
    "module.exports=Number.prototype;",
    "const p=require('./holder.cjs');function write(v){v.unrelated=1;}write(p);"]
];

for(const [name,holder,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe cross-file Number export keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(holder,mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-crossfile-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-crossfile-decoder-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
