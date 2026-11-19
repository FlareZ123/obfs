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
      code:'module.exports='+JSON.stringify('R'.repeat(2048)+'Z')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['Object.defineProperty returned descriptor',
    "function descriptor(){return {value:String.prototype};}const box={};Object.defineProperty(box,'ref',descriptor());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.defineProperty returned descriptor',
    "function descriptor(){return {value:String.prototype};}const box={};Reflect.defineProperty(box,'ref',descriptor());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties returned descriptor map',
    "function descriptors(){return {ref:{value:String.prototype}};}const box={};Object.defineProperties(box,descriptors());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty returned descriptor alias',
    "function descriptor(){return {value:String.prototype};}const d=descriptor();const box={};Object.defineProperty(box,'ref',d);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties returned map alias',
    "function descriptors(){return {ref:{value:String.prototype}};}const ds=descriptors();const box={};Object.defineProperties(box,ds);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty wrapped returned descriptor',
    "function descriptor(){return {value:String.prototype};}function wrapped(){return descriptor();}const box={};Object.defineProperty(box,'ref',wrapped());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties wrapped returned map',
    "function descriptors(){return {ref:{value:String.prototype}};}function wrapped(){return descriptors();}const box={};Object.defineProperties(box,wrapped());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign returned source control',
    "function source(){return {ref:String.prototype};}const box={};Object.assign(box,source());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('returned reflective container must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-return-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-return-container-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'R'.repeat(2048)+'Z');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Returned reflective container erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.defineProperty returned Number descriptor',
    "function descriptor(){return {value:Number.prototype};}const box={};Object.defineProperty(box,'ref',descriptor());box.ref.unrelated=1;"],
  ['Reflect.defineProperty returned Number descriptor',
    "function descriptor(){return {value:Number.prototype};}const box={};Reflect.defineProperty(box,'ref',descriptor());box.ref.unrelated=1;"],
  ['Object.defineProperties returned Number map',
    "function descriptors(){return {ref:{value:Number.prototype}};}const box={};Object.defineProperties(box,descriptors());box.ref.unrelated=1;"],
  ['Object.defineProperty returned Number alias',
    "function descriptor(){return {value:Number.prototype};}const d=descriptor();const box={};Object.defineProperty(box,'ref',d);box.ref.unrelated=1;"],
  ['Object.defineProperties returned Number map alias',
    "function descriptors(){return {ref:{value:Number.prototype}};}const ds=descriptors();const box={};Object.defineProperties(box,ds);box.ref.unrelated=1;"],
  ['Object.defineProperty wrapped Number descriptor',
    "function descriptor(){return {value:Number.prototype};}function wrapped(){return descriptor();}const box={};Object.defineProperty(box,'ref',wrapped());box.ref.unrelated=1;"],
  ['Object.defineProperties wrapped Number map',
    "function descriptors(){return {ref:{value:Number.prototype}};}function wrapped(){return descriptors();}const box={};Object.defineProperties(box,wrapped());box.ref.unrelated=1;"],
  ['Object.assign returned Number source',
    "function source(){return {ref:Number.prototype};}const box={};Object.assign(box,source());box.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe returned Number container keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-return-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-return-container-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
