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
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?String.prototype:undefined;}});function poison(p){p.charCodeAt=()=>0;}poison(Reflect.get(box,'ref'));"]
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
    "const box=new Proxy({}, {get(_t,key){return key==='ref'?Number.prototype:undefined;}});Reflect.get(box,'ref').unrelated=1;"]
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
