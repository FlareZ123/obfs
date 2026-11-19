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
      code:'module.exports='+JSON.stringify('A'.repeat(2048)+'W')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['Object.assign direct getter source',
    "const box={};Object.assign(box,{get ref(){return String.prototype;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign spread getter source',
    "const box={};Object.assign(box,{...{get ref(){return String.prototype;}}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign nested target getter source',
    "const box={inner:{}};Object.assign(box.inner,{get ref(){return String.prototype;}});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['legacy __defineGetter__ field',
    "const box={};box.__defineGetter__('ref',function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['legacy __defineGetter__ nested field',
    "const box={inner:{}};box.inner.__defineGetter__('ref',function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['legacy __defineGetter__ dynamic field',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__(key,function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign accessor alias control',
    "const source={get ref(){return String.prototype;}};const box={};Object.assign(box,source);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['Object.assign returned accessor control',
    "function source(){return {get ref(){return String.prototype;}};}const box={};Object.assign(box,source());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('accessor write must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-accessor-write-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-accessor-write-container-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'A'.repeat(2048)+'W');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Accessor write erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['Object.assign direct Number getter source',
    "const box={};Object.assign(box,{get ref(){return Number.prototype;}});box.ref.unrelated=1;"],
  ['Object.assign spread Number getter source',
    "const box={};Object.assign(box,{...{get ref(){return Number.prototype;}}});box.ref.unrelated=1;"],
  ['Object.assign nested Number getter source',
    "const box={inner:{}};Object.assign(box.inner,{get ref(){return Number.prototype;}});box.inner.ref.unrelated=1;"],
  ['legacy __defineGetter__ Number field',
    "const box={};box.__defineGetter__('ref',function(){return Number.prototype;});box.ref.unrelated=1;"],
  ['legacy __defineGetter__ nested Number field',
    "const box={inner:{}};box.inner.__defineGetter__('ref',function(){return Number.prototype;});box.inner.ref.unrelated=1;"],
  ['legacy __defineGetter__ dynamic Number field',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__(key,function(){return Number.prototype;});box.ref.unrelated=1;"],
  ['Object.assign Number accessor alias',
    "const source={get ref(){return Number.prototype;}};const box={};Object.assign(box,source);box.ref.unrelated=1;"],
  ['Object.assign returned Number accessor',
    "function source(){return {get ref(){return Number.prototype;}};}const box={};Object.assign(box,source());box.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe Number accessor write keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-accessor-write-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-accessor-write-container-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
