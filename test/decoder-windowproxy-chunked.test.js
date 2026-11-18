'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

const payload='A'.repeat(2048)+'Z';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdoutSha256:string,stdoutLength:number,stderr:string}>}
 */
async function run(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-windowproxy-chunk-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:2*1024*1024
    });
    if(child.error)throw child.error;
    return {status:child.status,stdoutSha256:createHash('sha256').update(child.stdout).digest('hex'),
      stdoutLength:child.stdout.length,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} side
 * @returns {SourceFile[]}
 */
function graph(side){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',code:'module.exports='+JSON.stringify(payload)+';'}
  ];
}

const unsafe=[
  ['top string prototype','globalThis.top=globalThis;top.String.prototype.charCodeAt=()=>0;'],
  ['parent string prototype','globalThis.parent=globalThis;parent.String.prototype.charCodeAt=()=>0;'],
  ['top array iterator','globalThis.top=globalThis;top.Array.prototype[Symbol.iterator]=function*(){yield 0;};'],
  ['window parent array iterator','globalThis.window=globalThis;globalThis.parent=globalThis;window.parent.Array.prototype[Symbol.iterator]=function*(){yield 0;};']
];

for(const [name,side] of unsafe){
  for(const mode of /** @type {const} */(['coo','sno'])){
    test('WindowProxy chunked decoder remains native under '+name+'/'+mode,async()=>{
      const input=graph(side);
      const result=obfuscateFiles(input,{mode,strings:true,
        properties:false,identifiers:false,
        seed:'windowproxy-chunked/'+name+'/'+mode});
      const original=await run(input);
      const generated=await run(result.files);
      assert.equal(original.status,0,original.stderr);
      assert.equal(original.stdoutLength,payload.length);
      assert.deepEqual(generated,original,'A previous module changed the generated decoder');
      assert.equal(result.files.find(file=>file.path==='target.cjs')?.metrics.literals,0,
        'Unsafe ambient intrinsic cannot leave the eager decoder enabled');
    });
  }
}

for(const mode of /** @type {const} */ (['coo','sno'])){
  test('unrelated top Number property retains long-string encoded work '+mode,async()=>{
    const input=graph('globalThis.top=globalThis;top.Number.windowAliasCanary=1;');
    const result=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'windowproxy-chunked/number-positive/'+mode
    });
    assert.equal(result.files.find(file=>file.path==='target.cjs')?.metrics.literals,1,
      'Positive control requires actual protected long-string work');
    assert.deepEqual(await run(result.files),await run(input));
  });
}
