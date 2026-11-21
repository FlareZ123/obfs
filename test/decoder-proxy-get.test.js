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
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['direct Proxy getter',
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['handler alias Proxy getter',
    "const handler={get(_t,key){return key==='ref'?String.prototype:undefined;}};const box=new Proxy({},handler);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['returned Proxy getter',
    "function holder(){return new Proxy({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}});}function poison(p){p.charCodeAt=()=>0;}poison(holder().ref);"],
  ['Reflect.get Proxy getter',
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}});function poison(p){p.charCodeAt=()=>0;}poison(Reflect.get(box,'ref'));"],
  ['computed Proxy get trap',
    "const box=new Proxy({}, {['get'](_t,key){return key==='ref'?String.prototype:undefined;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['named Proxy get trap',
    "function trap(_t,key){return key==='ref'?String.prototype:undefined;}const box=new Proxy({}, {get:trap});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['factory-produced Proxy handler',
    "function makeHandler(){return {get(_t,key){return key==='ref'?String.prototype:undefined;}};}const box=new Proxy({},makeHandler());function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['revocable Proxy get trap',
    "const box=Proxy.revocable({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}}).proxy;function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['aliased Proxy constructor',
    "const P=Proxy;const box=new P({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['aliased revocable Proxy factory',
    "const make=Proxy.revocable;const box=make({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}}).proxy;function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['assigned Proxy handler',
    "let handler;handler={get(_t,key){return key==='ref'?String.prototype:undefined;}};const box=new Proxy({},handler);function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['aliased Proxy trap callable',
    "const trap=(_t,key)=>key==='ref'?String.prototype:undefined;const alias=trap;const box=new Proxy({}, {get:alias});function poison(p){p.charCodeAt=()=>0;}poison(box.ref);"],
  ['direct post-construction get write',
    "const h={};h.get=(_t,k)=>k==='ref'?String.prototype:undefined;const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['alias post-construction get write',
    "const h={};const alias=h;alias.get=(_t,k)=>k==='ref'?String.prototype:undefined;const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['Reflect.set handler get',
    "const h={};Reflect.set(h,'get',(_t,k)=>k==='ref'?String.prototype:undefined);const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['Object.assign handler get',
    "const h={};Object.assign(h,{get(_t,k){return k==='ref'?String.prototype:undefined;}});const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['Object.defineProperty handler get',
    "const h={};Object.defineProperty(h,'get',{value:(_t,k)=>k==='ref'?String.prototype:undefined});const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['Object.defineProperties handler get',
    "const h={};Object.defineProperties(h,{get:{value:(_t,k)=>k==='ref'?String.prototype:undefined}});const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['accessor-produced handler get trap',
    "const h={get get(){return (_t,k)=>k==='ref'?String.prototype:undefined;}};const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"],
  ['computed post-construction get write',
    "const key='get';const h={};h[key]=(_t,k)=>k==='ref'?String.prototype:undefined;const p=new Proxy({},h);function poison(x){x.charCodeAt=()=>0;}poison(p.ref);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('Proxy getter must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-proxy-get/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-proxy-get-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'Z'.repeat(2048)+'P');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Proxy getter erased decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
    });
  }
}

const harmless=[
  ['direct Proxy Number getter',
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?Number.prototype:undefined;}});box.ref.unrelated=1;"],
  ['handler alias Proxy Number getter',
    "const handler={get(_t,key){return key==='ref'?Number.prototype:undefined;}};const box=new Proxy({},handler);box.ref.unrelated=1;"],
  ['returned Proxy Number getter',
    "function holder(){return new Proxy({}, {get(_t,key){return key==='ref'?Number.prototype:undefined;}});}holder().ref.unrelated=1;"],
  ['Reflect.get Proxy Number getter',
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?Number.prototype:undefined;}});Reflect.get(box,'ref').unrelated=1;"],
  ['computed Proxy Number getter',
    "const box=new Proxy({}, {['get'](){return Number.prototype;}});box.ref.unrelated=1;"],
  ['named Proxy Number getter',
    "function trap(){return Number.prototype;}const box=new Proxy({}, {get:trap});box.ref.unrelated=1;"],
  ['factory-produced Proxy Number handler',
    "function makeHandler(){return {get(){return Number.prototype;}};}const box=new Proxy({},makeHandler());box.ref.unrelated=1;"],
  ['revocable Proxy Number getter',
    "const box=Proxy.revocable({}, {get(){return Number.prototype;}}).proxy;box.ref.unrelated=1;"],
  ['aliased Proxy Number constructor',
    "const P=Proxy;const box=new P({}, {get(){return Number.prototype;}});box.ref.unrelated=1;"],
  ['aliased revocable Proxy Number factory',
    "const make=Proxy.revocable;const box=make({}, {get(){return Number.prototype;}}).proxy;box.ref.unrelated=1;"],
  ['assigned Proxy Number handler',
    "let handler;handler={get(){return Number.prototype;}};const box=new Proxy({},handler);box.ref.unrelated=1;"],
  ['aliased Proxy Number trap',
    "const trap=()=>Number.prototype;const alias=trap;const box=new Proxy({}, {get:alias});box.ref.unrelated=1;"],
  ['direct post-construction get write Number',
    "const h={};h.get=(_t,k)=>k==='ref'?Number.prototype:undefined;const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['alias post-construction get write Number',
    "const h={};const alias=h;alias.get=(_t,k)=>k==='ref'?Number.prototype:undefined;const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['Reflect.set handler get Number',
    "const h={};Reflect.set(h,'get',(_t,k)=>k==='ref'?Number.prototype:undefined);const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['Object.assign handler get Number',
    "const h={};Object.assign(h,{get(_t,k){return k==='ref'?Number.prototype:undefined;}});const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['Object.defineProperty handler get Number',
    "const h={};Object.defineProperty(h,'get',{value:(_t,k)=>k==='ref'?Number.prototype:undefined});const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['Object.defineProperties handler get Number',
    "const h={};Object.defineProperties(h,{get:{value:(_t,k)=>k==='ref'?Number.prototype:undefined}});const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['accessor-produced handler get trap Number',
    "const h={get get(){return (_t,k)=>k==='ref'?Number.prototype:undefined;}};const p=new Proxy({},h);p.ref.unrelated=1;"],
  ['computed post-construction get write Number',
    "const key='get';const h={};h[key]=(_t,k)=>k==='ref'?Number.prototype:undefined;const p=new Proxy({},h);p.ref.unrelated=1;"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe Proxy Number getter keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-proxy-get/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-proxy-get-safe-'));
      try {
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
    });
  }
}
