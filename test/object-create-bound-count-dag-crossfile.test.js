'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} SourceFile */

/**
 * Every runtime alias points to the one-argument-bound intrinsic, while the
 * compiler sees both bound and unbound first-class alternatives. A descriptor
 * supplied at argument index 0 invokes the prototype-returning getter.
 * @param {number} depth
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function graph(depth,intrinsic){
  /** @type {string[]} */
  const lines=['let a0=Object.create,b0=Object.create.bind(null,null);'];
  for(let level=1;level<=depth;level++){
    const prev=level-1;
    lines.push('let a'+level+'=a'+prev+';a'+level+'=b'+prev+';');
    lines.push('let b'+level+'=a'+prev+';b'+level+'=b'+prev+';');
  }
  lines.push('const descriptors={ref:{get(){return '+intrinsic+'.prototype;}}};');
  lines.push('const box=a'+depth+'(descriptors);box.ref.charCodeAt=()=>0;');
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:lines.join('\n')},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const depth of [2,5,8]){
    test('bound Object.create alias diamond native parity '+mode+' depth '+depth,async()=>{
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-dag-'));
      try{
        for(const intrinsic of /** @type {const} */(['String','Number'])){
          const files=graph(depth,intrinsic);
          const compiled=obfuscateFiles(files,{
            mode,seed:'bound-dag-crossfile-'+depth+'-'+intrinsic,
            strings:true,properties:false,identifiers:false
          });
          const target=compiled.files.find(file=>file.path==='target.cjs');
          assert.ok(target);
          assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
            'String getter blocks decoder; Number control retains encoding');
          const native=await execute(path.join(root,'native-'+intrinsic),files);
          const encoded=await execute(path.join(root,'encoded-'+intrinsic),compiled.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(encoded,native,
            'bound alias diamond must preserve native stdout and status');
        }
      }finally{
        await fs.rm(root,{recursive:true,force:true});
      }
    });
  }
}
