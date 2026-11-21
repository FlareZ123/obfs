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

const cases=[
  ['direct accessor', 'get(){return TARGET.prototype;}'],
  ['arrow accessor', 'get:()=>TARGET.prototype'],
  ['data descriptor', 'value:TARGET.prototype'],
  ['nested descriptor factory', 'get:function(){return TARGET.prototype;}']
];

for(const [name,descriptor] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('Object.create intrinsic provenance: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const ctor=safe?'Number':'String';
        const field=descriptor.replace('TARGET',ctor);
        const source='const box=Object.create(null,{ref:{'+field+
          '}});box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'object-create-decoder/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target,'transformed target must be present');
        assert.equal(target.metrics.literals,safe?1:0,
          'decoder must decline only the mutable intrinsic case');
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-object-create-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(emitted,native);
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
      });
    }
  }
}
