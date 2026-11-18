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
 * @param {string} source
 * @returns {SourceFile[]}
 */
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
  ['nested object path',
    "const box={inner:{slot:String.prototype}};function poison(p){p.charCodeAt=()=>0;}poison(box.inner.slot);"],
  ['nested array path',
    "const box=[[String.prototype]];function poison(p){p.charCodeAt=()=>0;}poison(box[0][0]);"],
  ['object then array path',
    "const box={inner:[String.prototype]};function poison(p){p.charCodeAt=()=>0;}poison(box.inner[0]);"],
  ['whole object escape',
    "const box={slot:String.prototype};function poison(o){o.slot.charCodeAt=()=>0;}poison(box);"],
  ['whole array escape',
    "const box=[String.prototype];function poison(a){a[0].charCodeAt=()=>0;}poison(box);"],
  ['whole object String constructor escape',
    "const box={slot:String};function poison(o){o.slot.fromCharCode=()=>'?';}poison(box);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('nested or whole container intrinsic must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-nested-container/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-container-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Nested or whole container erased mutable decoder intrinsic provenance');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['nested object Number path',
    "const box={inner:{slot:Number.prototype}};function write(p){p.unrelated=1;}write(box.inner.slot);"],
  ['nested array Number path',
    "const box=[[Number.prototype]];function write(p){p.unrelated=1;}write(box[0][0]);"],
  ['object then array Number path',
    "const box={inner:[Number.prototype]};function write(p){p.unrelated=1;}write(box.inner[0]);"],
  ['mixed nested safe sibling',
    "const box={inner:{hot:String.prototype,safe:Number.prototype}};function write(p){p.unrelated=1;}write(box.inner.safe);"],
  ['whole Number object escape',
    "const box={slot:Number.prototype};function write(o){o.slot.unrelated=1;}write(box);"],
  ['whole Number constructor object escape',
    "const box={slot:Number};function write(o){o.slot.fromCharCode=()=>'?';}write(box);"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe nested or whole Number container keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-nested-container/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-container-safe-'));
      try{
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
