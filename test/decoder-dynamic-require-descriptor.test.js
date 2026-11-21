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
/** @param {string} dir @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files */
async function execute(dir,files) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}
/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @type {Array<[string,string]>} */
const requireForms=[
  ['array-index require','const candidate=["./factory.cjs"];const {make}=require(candidate[0]);'],
  ['require-resolve indirection','const {make}=require(require.resolve("./factory.cjs"));']
];

for(const [name,load] of requireForms) {
  for(const sink of /** @type {const} */ (['create','defineProperties'])) {
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      for(const safe of [false,true]) {
        test('dynamic require getter descriptor: '+name+'/'+sink+'/'+mode+'/'+
          (safe?'Number positive':'String unsafe'),async()=>{
          const mutator=load+(sink==='create'?
            'const box=Object.create(null,make());':
            'const box={};Object.defineProperties(box,make());')+
            'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
          const input=[
            {path:'entry.cjs',sourceType:'commonjs',
              code:'require("./mutator.cjs");process.stdout.write(require("./target.cjs"));'},
            {path:'factory.cjs',sourceType:'commonjs',
              code:'module.exports.make=()=>({ref:{get(){return '+
                (safe?'Number':'String')+'.prototype;}}});'},
            {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
            {path:'target.cjs',sourceType:'commonjs',
              code:'module.exports='+JSON.stringify('R'.repeat(2048)+'T')+';'}
          ];
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'dynamic-require-descriptor/'+name+'/'+sink+'/'+mode+'/'+safe
          });
          const target=output.files.find(f=>f.path==='target.cjs');
          assert.ok(target);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-require-'));
          try {
            const native=await execute(path.join(root,'native'),input);
            const emitted=await execute(path.join(root,'emitted'),output.files);
            assert.equal(native.status,0,native.stderr);
            assert.equal(emitted.status,native.status,emitted.stderr);
            assert.equal(emitted.stderr,native.stderr);
            assert.ok(emitted.stdout===native.stdout,
              'stdout emitted='+digest(emitted.stdout)+' native='+digest(native.stdout));
          }finally {
            await fs.rm(root,{recursive:true,force:true});
          }
          assert.equal(target.metrics.literals,safe?1:0,'decoder yield differs');
        });
      }
    }
  }
}
