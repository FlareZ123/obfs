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
      code:'module.exports='+JSON.stringify('L'.repeat(2048)+'C')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['inherited __defineGetter__.call',
    "const box={};box.__defineGetter__.call(box,'ref',function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['aliased inherited __defineGetter__.call',
    "const box={};const define=box.__defineGetter__;define.call(box,'ref',function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['nested inherited __defineGetter__.call',
    "const box={inner:{}};box.inner.__defineGetter__.call(box.inner,'ref',function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['dynamic inherited __defineGetter__.call',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__.call(box,key,function(){return String.prototype;});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['inherited __defineGetter__.apply',
    "const box={};box.__defineGetter__.apply(box,['ref',function(){return String.prototype;}]);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['aliased inherited __defineGetter__.apply',
    "const box={};const define=box.__defineGetter__;define.apply(box,['ref',function(){return String.prototype;}]);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['nested inherited __defineGetter__.apply',
    "const box={inner:{}};box.inner.__defineGetter__.apply(box.inner,['ref',function(){return String.prototype;}]);function poison(p){p.charCodeAt=()=>0;}poison(box.inner.ref);"],
  ['dynamic inherited __defineGetter__.apply',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__.apply(box,[key,function(){return String.prototype;}]);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('legacy getter call must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-legacy-getter-call/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-legacy-getter-call-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'L'.repeat(2048)+'C');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Indirect legacy getter erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['inherited Number __defineGetter__.call',
    "const box={};box.__defineGetter__.call(box,'ref',function(){return Number.prototype;});box.ref.unrelated=1;"],
  ['aliased inherited Number __defineGetter__.call',
    "const box={};const define=box.__defineGetter__;define.call(box,'ref',function(){return Number.prototype;});box.ref.unrelated=1;"],
  ['nested inherited Number __defineGetter__.call',
    "const box={inner:{}};box.inner.__defineGetter__.call(box.inner,'ref',function(){return Number.prototype;});box.inner.ref.unrelated=1;"],
  ['dynamic inherited Number __defineGetter__.call',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__.call(box,key,function(){return Number.prototype;});box.ref.unrelated=1;"],
  ['inherited Number __defineGetter__.apply',
    "const box={};box.__defineGetter__.apply(box,['ref',function(){return Number.prototype;}]);box.ref.unrelated=1;"],
  ['aliased inherited Number __defineGetter__.apply',
    "const box={};const define=box.__defineGetter__;define.apply(box,['ref',function(){return Number.prototype;}]);box.ref.unrelated=1;"],
  ['nested inherited Number __defineGetter__.apply',
    "const box={inner:{}};box.inner.__defineGetter__.apply(box.inner,['ref',function(){return Number.prototype;}]);box.inner.ref.unrelated=1;"],
  ['dynamic inherited Number __defineGetter__.apply',
    "const box={};const key=process.argv.length?'ref':'other';box.__defineGetter__.apply(box,[key,function(){return Number.prototype;}]);box.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe Number legacy getter call keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-legacy-getter-call/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-legacy-getter-call-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
