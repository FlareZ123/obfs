'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
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
      code:'module.exports='+JSON.stringify('R'.repeat(2048)+'Q')+';'}
  ];
}

const cases=[
  ['captured Object.create method',
    'const create=Object.create;const box=create(null,{ref:{get(){return TARGET.prototype;}}});'],
  ['descriptor-map local alias',
    'const descriptors={ref:{get(){return TARGET.prototype;}}};const box=Object.create(null,descriptors);'],
  ['descriptor factory call',
    'function desc(){return {ref:{get(){return TARGET.prototype;}}};}const box=Object.create(null,desc());'],
  ['literal computed keys',
    "const box=Object.create(null,{['ref']:{['get'](){return TARGET.prototype;}}});"],
  ['named accessor callback',
    'function read(){return TARGET.prototype;}const box=Object.create(null,{ref:{get:read}});'],
  ['descriptor map copied into local',
    'const source={ref:{get(){return TARGET.prototype;}}};const descriptors=source;const box=Object.create(null,descriptors);']
];

for(const [name,header] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('indirect Object.create descriptor: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const ctor=safe?'Number':'String';
        const source=header.replace('TARGET',ctor)+'box.ref.'+
          (safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'object-create-descriptor/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target,'transformed target must be present');
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-descriptor-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(emitted,native,'original and emitted code behave differently');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,safe?1:0,
          'retained decoder yield must reflect the sensitive intrinsic');
      });
    }
  }
}
