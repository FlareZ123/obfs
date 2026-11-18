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
  ['named object field holding String prototype',
    "const box={slot:String.prototype};function poison(p){p.charCodeAt=()=>0;}poison(box.slot);"],
  ['nested object field holding String prototype',
    "const box={inner:{slot:String.prototype}};function poison(p){p.charCodeAt=()=>0;}poison(box.inner.slot);"],
  ['array index holding String prototype',
    "const box=[String.prototype];function poison(p){p.charCodeAt=()=>0;}poison(box[0]);"],
  ['object variable alias',
    "const box={slot:String.prototype};const alias=box;function poison(p){p.charCodeAt=()=>0;}poison(alias.slot);"],
  ['computed object key from local constant',
    "const box={slot:String.prototype};const key='slot';function poison(p){p.charCodeAt=()=>0;}poison(box[key]);"],
  ['object field holding String constructor',
    "const box={slot:String};function poison(C){C.fromCharCode=()=>'?';}poison(box.slot);"],
  ['whole object contains String prototype',
    "const box={slot:String.prototype};function poison(o){o.slot.charCodeAt=()=>0;}poison(box);"]
];
for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('local container intrinsic escape must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-wrapped-escape/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wrapped-decoder-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Unproved call or tag leaked mutable decoder intrinsic');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['named object field holding Number prototype',
    "const box={slot:Number.prototype};function poison(p){p.charCodeAt=()=>0;}poison(box.slot);"],
  ['nested object field holding Number prototype',
    "const box={inner:{slot:Number.prototype}};function poison(p){p.charCodeAt=()=>0;}poison(box.inner.slot);"],
  ['array index holding Number prototype',
    "const box=[Number.prototype];function poison(p){p.charCodeAt=()=>0;}poison(box[0]);"],
  ['object variable alias with Number prototype',
    "const box={slot:Number.prototype};const alias=box;function poison(p){p.charCodeAt=()=>0;}poison(alias.slot);"],
  ['computed object key with Number prototype',
    "const box={slot:Number.prototype};const key='slot';function poison(p){p.charCodeAt=()=>0;}poison(box[key]);"],
  ['object field holding Number constructor',
    "const box={slot:Number};function poison(C){C.fromCharCode=()=>'?';}poison(box.slot);"],
  ['whole object contains Number prototype',
    "const box={slot:Number.prototype};function poison(o){o.slot.charCodeAt=()=>0;}poison(box);"]
];
for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe local Number container keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-wrapped-escape/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wrapped-decoder-safe-'));
      try {
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

