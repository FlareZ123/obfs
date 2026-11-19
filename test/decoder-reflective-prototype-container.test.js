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
      code:'module.exports='+JSON.stringify('P'.repeat(2048)+'X')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['Object.setPrototypeOf inherited field',
    "const box={};Object.setPrototypeOf(box,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.setPrototypeOf inherited field',
    "const box={};Reflect.setPrototypeOf(box,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.setPrototypeOf parent alias',
    "const parent={ref:String.prototype};const box={};Object.setPrototypeOf(box,parent);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.setPrototypeOf nested target',
    "const box={inner:{}};Reflect.setPrototypeOf(box.inner,{ref:String.prototype});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['Object.setPrototypeOf inherited descriptor value',
    "const descriptor={};Object.setPrototypeOf(descriptor,{value:String.prototype});const box={};Object.defineProperty(box,'ref',descriptor);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Reflect.setPrototypeOf inherited descriptor value',
    "const descriptor={};Reflect.setPrototypeOf(descriptor,{value:String.prototype});const box={};Reflect.defineProperty(box,'ref',descriptor);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('prototype-linked container must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-prototype-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-prototype-container-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'P'.repeat(2048)+'X');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Prototype-linked container erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.setPrototypeOf inherited Number field',
    "const box={};Object.setPrototypeOf(box,{ref:Number.prototype});box.ref.unrelated=1;"],
  ['Reflect.setPrototypeOf inherited Number field',
    "const box={};Reflect.setPrototypeOf(box,{ref:Number.prototype});box.ref.unrelated=1;"],
  ['Object.setPrototypeOf Number parent alias',
    "const parent={ref:Number.prototype};const box={};Object.setPrototypeOf(box,parent);box.ref.unrelated=1;"],
  ['Reflect.setPrototypeOf nested Number target',
    "const box={inner:{}};Reflect.setPrototypeOf(box.inner,{ref:Number.prototype});box.inner.ref.unrelated=1;"],
  ['Object.setPrototypeOf inherited Number descriptor value',
    "const descriptor={};Object.setPrototypeOf(descriptor,{value:Number.prototype});const box={};Object.defineProperty(box,'ref',descriptor);box.ref.unrelated=1;"],
  ['Reflect.setPrototypeOf inherited Number descriptor value',
    "const descriptor={};Reflect.setPrototypeOf(descriptor,{value:Number.prototype});const box={};Reflect.defineProperty(box,'ref',descriptor);box.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe prototype-linked Number container keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-reflective-prototype-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-prototype-container-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
