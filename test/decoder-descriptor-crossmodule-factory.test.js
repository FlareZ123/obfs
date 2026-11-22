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

const factories=[
  ['inline exported make',
    'exports.make=()=>({ref:{get(){return CTOR.prototype;}}});',
    'const {make}=require("./factory.cjs");const ds=make();'],
  ['named make object export',
    'const desc={get(){return CTOR.prototype;}};function make(){return {ref:desc};}module.exports={make};',
    'const {make}=require("./factory.cjs");const ds=make();'],
  ['arrow aliased map export',
    'const desc={get(){return CTOR.prototype;}};const map={ref:desc};const make=()=>map;module.exports.make=make;',
    'const {make}=require("./factory.cjs");const ds=make();'],
  ['descriptor shorthand export',
    'const desc={get(){return CTOR.prototype;}};module.exports={desc};',
    'const {desc}=require("./factory.cjs");const ds={ref:desc};']
];

for(const [name,make,consume] of factories) {
  for(const sink of /** @type {const} */ (['create','defineProperties'])) {
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      for(const safe of [false,true]) {
        test('cross-file descriptor provenance: '+name+'/'+sink+'/'+mode+'/'+
          (safe?'Number positive':'String unsafe'),async()=>{
          const ctor=safe?'Number':'String';
          const mutator=consume+
            (sink==='create'?'const box=Object.create(null,ds);':
              'const box={};Object.defineProperties(box,ds);')+
            'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
          /** @type {SourceFile[]} */
          const input=[
            {path:'entry.cjs',sourceType:'commonjs',
              code:'require("./mutator.cjs");process.stdout.write(require("./target.cjs"));'},
            {path:'factory.cjs',sourceType:'commonjs',code:make.replace('CTOR',ctor)},
            {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
            {path:'target.cjs',sourceType:'commonjs',
              code:'module.exports='+JSON.stringify('K'.repeat(2048)+'B')+';'}
          ];
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'cross-file-descriptor/'+name+'/'+sink+'/'+mode+'/'+safe
          });
          const target=output.files.find(f=>f.path==='target.cjs');
          assert.ok(target);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-desc-xmod-'));
          try{
            const native=await execute(path.join(root,'native'),input);
            const emitted=await execute(path.join(root,'emitted'),output.files);
            assert.equal(native.status,0,native.stderr);
            assert.equal(emitted.status,native.status,emitted.stderr);
            assert.equal(emitted.stderr,native.stderr);
            assert.ok(emitted.stdout===native.stdout,
              'stdout emitted='+digest(emitted.stdout)+' native='+digest(native.stdout));
          }finally{
            await fs.rm(root,{recursive:true,force:true});
          }
          assert.equal(target.metrics.literals,safe?1:0,'decoder yield');
        });
      }
    }
  }
}
