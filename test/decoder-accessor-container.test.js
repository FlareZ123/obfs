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
      code:'module.exports='+JSON.stringify('G'.repeat(2048)+'Y')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['Object.defineProperty accessor descriptor',
    "const box={};Object.defineProperty(box,'ref',{get(){return String.prototype;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.defineProperty accessor descriptor',
    "const box={};Reflect.defineProperty(box,'ref',{get(){return String.prototype;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties accessor descriptor map',
    "const box={};Object.defineProperties(box,{ref:{get(){return String.prototype;}}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty descriptor value getter',
    "const descriptor={get value(){return String.prototype;}};const box={};Object.defineProperty(box,'ref',descriptor);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['object literal getter field',
    "const box={get ref(){return String.prototype;}};function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['returned object getter field',
    "function holder(){return {get ref(){return String.prototype;}};}function poison(p){p.charCodeAt=()=>0;}poison(holder().ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('accessor container must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-accessor-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-accessor-container-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'G'.repeat(2048)+'Y');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Accessor container erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.defineProperty Number accessor descriptor',
    "const box={};Object.defineProperty(box,'ref',{get(){return Number.prototype;}});box.ref.unrelated=1;"],
  ['Reflect.defineProperty Number accessor descriptor',
    "const box={};Reflect.defineProperty(box,'ref',{get(){return Number.prototype;}});box.ref.unrelated=1;"],
  ['Object.defineProperties Number accessor descriptor map',
    "const box={};Object.defineProperties(box,{ref:{get(){return Number.prototype;}}});box.ref.unrelated=1;"],
  ['Object.defineProperty Number descriptor value getter',
    "const descriptor={get value(){return Number.prototype;}};const box={};Object.defineProperty(box,'ref',descriptor);box.ref.unrelated=1;"],
  ['object literal Number getter field',
    "const box={get ref(){return Number.prototype;}};box.ref.unrelated=1;"],
  ['returned object Number getter field',
    "function holder(){return {get ref(){return Number.prototype;}};}holder().ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe Number accessor container keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-accessor-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-accessor-container-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
