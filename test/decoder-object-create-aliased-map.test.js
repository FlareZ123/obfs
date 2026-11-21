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

const variants=[
  ['local descriptor map',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=Object.create(null,descriptors);'],
  ['local descriptor map alias',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const other=descriptors;const box=Object.create(null,other);'],
  ['first-class Object.create',
    'const create=Object.create;'+
    'const box=create(null,{ref:{get(){return TARGET.prototype}}});'],
  ['first-class create with mapped descriptor',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const create=Object.create;const box=create(null,descriptors);'],
  ['computed descriptor key',
    'const key="ref";const descriptors={[key]:{get(){return TARGET.prototype}}};'+
    'const box=Object.create(null,descriptors);']
];

for(const [name,mutator] of variants) {
  for(const mode of /** @type {const} */(['coo','sno'])) {
    for(const safe of [false,true]) {
      test('Object.create alias descriptor parity: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const source=mutator.replace('TARGET',safe?'Number':'String')+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const emitted=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'object-create-aliased-map/'+name+'/'+mode+'/'+safe
        });
        const target=emitted.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-descriptor-alias-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(protectedRun,native,
            'Obfuscated eager decoder diverged from native source');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,safe?1:0,
          'Conservative unsafe refusal and independent benign yield');
      });
    }
  }
}
