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
  ['Object.assign field',
    "const box={};Object.assign(box,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign nested field',
    "const box={};Object.assign(box,{inner:{ref:String.prototype}});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['Reflect.set field',
    "const box={};Reflect.set(box,'ref',String.prototype);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty field',
    "const box={};Object.defineProperty(box,'ref',{value:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.defineProperty String constructor',
    "const box={};Reflect.defineProperty(box,'ref',{value:String});function poison(C){C.fromCharCode=()=>'?';}poison(box.ref);"],
  ['Object.defineProperties field',
    "const box={};Object.defineProperties(box,{ref:{value:String.prototype}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('reflective sensitive field write must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-container-write/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-write-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Reflective field write erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.assign Number field',
    "const box={};Object.assign(box,{ref:Number.prototype});function write(p){p.unrelated=1;}write(box.ref);"],
  ['Object.assign mixed safe sibling',
    "const box={};Object.assign(box,{hot:String.prototype,safe:Number.prototype});function write(p){p.unrelated=1;}write(box.safe);"],
  ['Reflect.set Number field',
    "const box={};Reflect.set(box,'ref',Number.prototype);function write(p){p.unrelated=1;}write(box.ref);"],
  ['Object.defineProperty Number field',
    "const box={};Object.defineProperty(box,'ref',{value:Number.prototype});function write(p){p.unrelated=1;}write(box.ref);"],
  ['Reflect.defineProperty Number constructor',
    "const box={};Reflect.defineProperty(box,'ref',{value:Number});function write(C){C.fromCharCode=()=>'?';}write(box.ref);"],
  ['Object.defineProperties Number field',
    "const box={};Object.defineProperties(box,{ref:{value:Number.prototype}});function write(p){p.unrelated=1;}write(box.ref);"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe reflective Number field keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-container-write/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-write-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
