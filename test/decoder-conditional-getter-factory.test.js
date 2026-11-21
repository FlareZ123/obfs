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
/** @param {string} dir @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files @param {string} entry */
async function execute(dir,files,entry) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,entry)],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}
/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @type {Array<[string,string,'commonjs'|'module',string,string]>} */
const cases=[
  ['CJS conditional arrow factory','entry.cjs','commonjs',
    'const desc={get(){return CTOR.prototype;}};module.exports.make=()=>{if(true){return {ref:desc};}return {};};',
    'const make=require("./factory.cjs").make;'],
  ['ESM conditional default factory','entry.mjs','module',
    'const desc={get(){return CTOR.prototype;}};export default ()=>{if(true){return {ref:desc};}return {};};',
    'import make from "./factory.mjs";']
];

for(const [name,entry,kind,factory,load] of cases) {
  for(const sink of /** @type {const} */ (['create','defineProperties'])) {
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      for(const safe of [false,true]) {
        test('conditional getter factory: '+name+'/'+sink+'/'+mode+'/'+
          (safe?'Number positive':'String unsafe'),async()=>{
          const mutator=load+(sink==='create'?
            'const box=Object.create(null,make());':
            'const box={};Object.defineProperties(box,make());')+
            'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
          const input=[
            {path:entry,sourceType:kind,
              code:kind==='module'?
                'import "./mutator.mjs";import target from "./target.mjs";process.stdout.write(target);':
                'require("./mutator.cjs");process.stdout.write(require("./target.cjs"));'},
            {path:kind==='module'?'factory.mjs':'factory.cjs',
              sourceType:kind,code:factory.replace('CTOR',safe?'Number':'String')},
            {path:kind==='module'?'mutator.mjs':'mutator.cjs',
              sourceType:kind,code:mutator},
            {path:kind==='module'?'target.mjs':'target.cjs',sourceType:kind,
              code:(kind==='module'?'export default ':'module.exports=')+
                JSON.stringify('P'.repeat(2048)+'V')+';'}
          ];
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'conditional-getter-factory/'+name+'/'+sink+'/'+mode+'/'+safe
          });
          const target=output.files.find(f=>f.path===(kind==='module'?'target.mjs':'target.cjs'));
          assert.ok(target);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-conditional-desc-'));
          try {
            const native=await execute(path.join(root,'native'),input,entry);
            const emitted=await execute(path.join(root,'emitted'),output.files,entry);
            assert.equal(native.status,0,native.stderr);
            assert.equal(emitted.status,native.status,emitted.stderr);
            assert.equal(emitted.stderr,native.stderr);
            assert.ok(emitted.stdout===native.stdout,
              'stdout emitted='+digest(emitted.stdout)+' native='+digest(native.stdout));
          } finally {
            await fs.rm(root,{recursive:true,force:true});
          }
          assert.equal(target.metrics.literals,safe?1:0,'decoder yield differs');
        });
      }
    }
  }
}
