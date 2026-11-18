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
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('X'.repeat(2048)+'Z')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const sensitive=[
  ['lexically shadowed Object.getPrototypeOf',
    "const Object={getPrototypeOf(){return String.prototype}};const P=Object.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['lexically shadowed Reflect.getPrototypeOf',
    "const Reflect={getPrototypeOf(){return String.prototype}};const P=Reflect.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['lexically shadowed Array.prototype',
    "const Array={prototype:String.prototype};const P=Array.prototype;P.charCodeAt=()=>0;"]
];

for(const [name,source] of sensitive) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('shadowed native-prototype proof must refuse: '+name+'/'+mode,async()=>{
      const input=graph(source);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'shadowed-intrinsic-decoder/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-shadowed-decoder-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'X'.repeat(2048)+'Z');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Source-visible rebinding of a native intrinsic changed generated output');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['shadowed Object returns unrelated Number prototype',
    "const Object={getPrototypeOf(){return Number.prototype}};const P=Object.getPrototypeOf(7);P.unrelated=1;"],
  ['shadowed Reflect returns unrelated Number prototype',
    "const Reflect={getPrototypeOf(){return Number.prototype}};const P=Reflect.getPrototypeOf(7);P.unrelated=1;"],
  ['shadowed Array has unrelated Number prototype field',
    "const Array={prototype:Number.prototype};const P=Array.prototype;P.unrelated=1;"]
];

for(const [name,source] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('harmless shadowed intrinsic keeps literal coverage: '+name+'/'+mode,async()=>{
      const input=graph(source);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'shadowed-intrinsic-decoder/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-shadowed-decoder-positive-'));
      try {
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}
