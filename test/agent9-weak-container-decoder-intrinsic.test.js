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
const secret='S'.repeat(2048)+'V';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-weak-decoder-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:15000
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(secret)+';'}
  ];
}

/** @type {Array<[string,string]>} */
const mutators=[
  ['WeakRef deref', 'const weak=new WeakRef(String.prototype);'+
    'weak.deref().charCodeAt=()=>0;'],
  ['WeakRef constructor alias',
    'const C=WeakRef;const weak=new C(String.prototype);'+
    'weak.deref().charCodeAt=()=>0;'],
  ['WeakRef returned through helper',
    'function get(){return new WeakRef(String.prototype);}'+
    'get().deref().charCodeAt=()=>0;'],
  ['WeakRef Reflect.construct',
    'Reflect.construct(WeakRef,[String.prototype]).deref().charCodeAt=()=>0;'],
  ['WeakMap value retrieval',
    'const k={};const m=new WeakMap();m.set(k,String.prototype);'+
    'm.get(k).charCodeAt=()=>0;'],
  ['WeakMap constructor records',
    'const k={};const m=new WeakMap([[k,String.prototype]]);'+
    'm.get(k).charCodeAt=()=>0;'],
  ['Proxy target setter',
    'const p=new Proxy(String.prototype,{});p.charCodeAt=()=>0;'],
  ['Proxy.revocable target setter',
    'const {proxy}=Proxy.revocable(String.prototype,{});'+
    'proxy.charCodeAt=()=>0;']
];

for(const [name,mutator] of mutators){
  for(const mode of /** @type {const} */ (['coo','sno'])){
    test('decoder preserves source under '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const files=graph(mutator);
      const native=await run(files);
      assert.deepEqual({status:native.status,stdout:native.stdout},
        {status:0,stdout:secret},'native fixture failed: '+native.stderr);
      const transformed=obfuscateFiles(files,{
        mode,seed:'agent9-weak-decoder/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      const emitted=await run(transformed.files);
      assert.deepEqual(emitted,native,
        name+'/'+mode+' ambient decoder alias mismatch; transformed literals='+
        transformed.files.find(f=>f.path==='target.cjs')?.metrics.literals);
    });
  }
}

test('same long string is independently eligible for chunked encoding',()=>{
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const target=graph('')[2];
    const transformed=obfuscateFiles([target],{
      mode,seed:'agent9-weak-decoder-control/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(transformed.files[0].metrics.literals>0,
      'negative/control transformation must be demonstrably eligible');
  }
});
