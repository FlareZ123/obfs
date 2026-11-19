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
  ['Object.assign object field',
    "const box={};Object.assign(box,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty object field',
    "const box={};Object.defineProperty(box,'ref',{value:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties object field',
    "const box={};Object.defineProperties(box,{ref:{value:String.prototype}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.set object field',
    "const box={};Reflect.set(box,'ref',String.prototype);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.defineProperty object field',
    "const box={};Reflect.defineProperty(box,'ref',{value:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign source alias',
    "const box={};const source={ref:String.prototype};Object.assign(box,source);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign nested target',
    "const box={inner:{}};Object.assign(box.inner,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['Object.defineProperty descriptor alias',
    "const box={};const descriptor={value:String.prototype};Object.defineProperty(box,'ref',descriptor);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties descriptor map alias',
    "const box={};const descriptors={ref:{value:String.prototype}};Object.defineProperties(box,descriptors);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.set dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Reflect.set(box,key,String.prototype);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperty dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Object.defineProperty(box,key,{value:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.defineProperty dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Reflect.defineProperty(box,key,{value:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.defineProperties dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';const descriptors={[key]:{value:String.prototype}};Object.defineProperties(box,descriptors);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('reflective container write must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-container-write/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-container-write-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Reflective write erased decoder intrinsic container provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.assign Number field',
    "const box={};Object.assign(box,{ref:Number.prototype});box.ref.unrelated=1;"],
  ['Object.defineProperty Number field',
    "const box={};Object.defineProperty(box,'ref',{value:Number.prototype});box.ref.unrelated=1;"],
  ['Object.defineProperties Number field',
    "const box={};Object.defineProperties(box,{ref:{value:Number.prototype}});box.ref.unrelated=1;"],
  ['Reflect.set Number field',
    "const box={};Reflect.set(box,'ref',Number.prototype);box.ref.unrelated=1;"],
  ['Reflect.defineProperty Number field',
    "const box={};Reflect.defineProperty(box,'ref',{value:Number.prototype});box.ref.unrelated=1;"],
  ['Object.assign Number source alias',
    "const box={};const source={ref:Number.prototype};Object.assign(box,source);box.ref.unrelated=1;"],
  ['Object.assign nested Number target',
    "const box={inner:{}};Object.assign(box.inner,{ref:Number.prototype});box.inner.ref.unrelated=1;"],
  ['Object.defineProperty Number descriptor alias',
    "const box={};const descriptor={value:Number.prototype};Object.defineProperty(box,'ref',descriptor);box.ref.unrelated=1;"],
  ['Object.defineProperties Number descriptor map alias',
    "const box={};const descriptors={ref:{value:Number.prototype}};Object.defineProperties(box,descriptors);box.ref.unrelated=1;"],
  ['Reflect.set Number dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Reflect.set(box,key,Number.prototype);box.ref.unrelated=1;"],
  ['Object.defineProperty Number dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Object.defineProperty(box,key,{value:Number.prototype});box.ref.unrelated=1;"],
  ['Reflect.defineProperty Number dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';Reflect.defineProperty(box,key,{value:Number.prototype});box.ref.unrelated=1;"],
  ['Object.defineProperties Number dynamic key',
    "const box={};const key=process.argv.length?'ref':'other';const descriptors={[key]:{value:Number.prototype}};Object.defineProperties(box,descriptors);box.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe reflective Number write keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-container-write/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-container-write-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
