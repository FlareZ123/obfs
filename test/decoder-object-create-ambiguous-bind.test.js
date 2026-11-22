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
 * An alias has two reachable bound-argument counts (one or two).
 * The unsafe execution selects the one-bound route, so the descriptor
 * argument remains the call's first operand; the other route installs
 * a harmless descriptor ahead of the same call.
 * @param {'String'|'Number'} type
 * @param {boolean} alternate
 * @returns {SourceFile[]}
 */
function fixture(type,alternate){
  const source=[
    'const DESCRIPTORS={ref:{get(){return '+type+'.prototype;}}};',
    'const make=Object.create;',
    'const first=make.bind(null,null);',
    'let alias=first;',
    'if('+JSON.stringify(alternate)+')alias=first.bind(null,{ref:{get(){return Number.prototype;}}});',
    'const box=alias(DESCRIPTORS);',
    'box.ref.'+(type==='String'?'charCodeAt=()=>0;':'unrelated=1;')
  ].join('\n');
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:source},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Q'.repeat(2048)+'Z')+';'}
  ];
}

/**
 * @param {string} root
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(root,files){
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(result.error)throw result.error;
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}

for(const type of /** @type {const} */ (['String','Number'])){
  for(const alternate of [false,true]){
    for(const mode of /** @type {const} */ (['coo','sno'])){
      test('ambiguous Object.create prebound alias native parity '+type+'/'+alternate+'/'+mode,
        async()=>{
          const input=fixture(type,alternate);
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'ambiguous-bound-replay/'+type+'/'+alternate+'/'+mode
          });
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ambiguous-bind-'));
          try{
            const original=await run(path.join(root,'original'),input);
            const transformed=await run(path.join(root,'transformed'),output.files);
            assert.equal(original.status,0,original.stderr);
            assert.deepEqual(transformed,original,
              'Potential descriptor position missed after alternate binding');
          }finally{
            await fs.rm(root,{recursive:true,force:true});
          }
        });
    }
  }
}
