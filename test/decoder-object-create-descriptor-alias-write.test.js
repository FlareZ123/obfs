'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
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
  const child=require('node:child_process').spawnSync(
    process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
    });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

const aliasWrite =
  'const descriptors={};const alias=descriptors;'+
  'alias.ref={get(){return TARGET.prototype}};'+
  'const box=Object.create(null,descriptors);';

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test('Object.create descriptor map written through a separate alias: '+mode,
    async()=>{
      const mutator=aliasWrite.replace('TARGET','String')+
        'box.ref.charCodeAt=()=>0;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-alias-write/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-alias-write-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Obfuscated eager decoder diverged from native source');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,0,
        'String.prototype mutation must block eager decoder encoding');
    });
  test('Object.create descriptor alias Number control retains encoding: '+mode,
    async()=>{
      const mutator=aliasWrite.replace('TARGET','Number')+
        'box.ref.unrelated=1;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-alias-write-number/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-alias-number-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Benign Number.prototype descriptor changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Benign Number.prototype access must retain positive decoder yield');
    });
}
