'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Array destructuring preserves the original entry reference when the
 * element is directly sourced from a descriptor-map member read.
 * @param {'declaration'|'assignment'|'default'} form
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function sourceGraph(form,intrinsic) {
  const binding=form==='declaration'?
    'const [entry]=[descriptors.ref];':
    form==='assignment'?
      'let entry;[entry]=[descriptors.ref];':
      'const [entry={}] =[descriptors["ref"]];';
  const mutation=[
    'const descriptors={ref:{}};',
    binding,
    'entry.get=function(){return '+intrinsic+'.prototype};',
    'const box=Object.create(null,descriptors);',
    intrinsic==='String'?'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;'
  ].join('');
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutation},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files) {
    await atomicWrite(path.join(directory,file.path),file.code);
  }
  const run=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(run.error)throw run.error;
  return {status:run.status,stdout:run.stdout,stderr:run.stderr};
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  for(const form of /** @type {const} */ (['declaration','assignment','default'])) {
    for(const intrinsic of /** @type {const} */ (['String','Number'])) {
      test('descriptor array binding native parity '+mode+'/'+form+'/'+intrinsic,
        async()=>{
          const input=sourceGraph(form,intrinsic);
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'descriptor-array-entry-alias/'+mode+'/'+form+'/'+intrinsic
          });
          const target=output.files.find(file=>file.path==='target.cjs');
          assert.ok(target);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-entry-'));
          try {
            const native=await execute(path.join(root,'native'),input);
            assert.equal(native.status,0,native.stderr);
            const transformed=await execute(path.join(root,'transformed'),output.files);
            assert.deepEqual(transformed,native,
              'array member-read alias changed native execution');
          }finally{
            await fs.rm(root,{recursive:true,force:true});
          }
          assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
            'decoder-sensitive array alias must refuse while Number retains yield');
        });
    }
  }
}
