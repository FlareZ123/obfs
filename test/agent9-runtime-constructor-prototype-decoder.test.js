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

/** @typedef {{path:string,sourceType:'commonjs',code:string}} SourceFile */
const expected='C'.repeat(2048)+'P';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-ctor-'));
  try{
    for(const f of files)await atomicWrite(path.join(root,f.path),f.code);
    const p=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:15000
    });
    if(p.error)throw p.error;
    return {status:p.status,stdout:p.stdout,stderr:p.stderr};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} side @returns {SourceFile[]} */
function bundle(side){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(expected)+';'}
  ];
}

/** @type {Array<[string,string]>} */
const unsafe=[
  ['JSON.stringify inline .constructor.prototype',
    'const p=(JSON.stringify(0)).constructor.prototype;p.charCodeAt=()=>0;'],
  ['JSON.parse primitive inline .constructor.prototype',
    "const p=(JSON.parse('\\\"a\\\"')).constructor.prototype;p.charCodeAt=()=>0;"],
  ['String.fromCharCode constructor prototype',
    'const p=(String.fromCharCode(65)).constructor.prototype;p.charCodeAt=()=>0;'],
  ['String.raw constructor prototype',
    'const p=(String.raw`a`).constructor.prototype;p.charCodeAt=()=>0;'],
  ['constructor captured then prototype accessed',
    'const C=(JSON.stringify(0)).constructor;const p=C.prototype;p.charCodeAt=()=>0;'],
  ['constructor captured then fromCharCode patched',
    "const C=(JSON.stringify(0)).constructor;C.fromCharCode=()=>'!';"],
  ['constructor through result variable and prototype',
    'const s=JSON.stringify(0);const C=s.constructor;const p=C.prototype;p.charCodeAt=()=>0;']
];

for(const [name,mutator] of unsafe){
  for(const mode of /** @type {const} */ (['coo','sno'])){
    test('opaque string primitive constructor alias preserves eager decoder: '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const files=bundle(mutator);
      const native=await run(files);
      assert.equal(native.status,0,name+' native failed: '+native.stderr);
      assert.equal(native.stdout,expected);
      const result=obfuscateFiles(files,{
        mode,seed:'agent9-opaque-primitive-ctor/'+name+'/'+mode,
        strings:true,identifiers:false,properties:false
      });
      const actual=await run(result.files);
      assert.equal(actual.status,native.status,name+' status '+actual.stderr);
      const hash=/** @param {string} s @returns {string} */ s=>
        createHash('sha256').update(s).digest('hex');
      assert.equal(hash(actual.stdout),hash(native.stdout),
        name+'/'+mode+' wrong decoded output after unproved native constructor alias'+
        ', target literals='+result.files.find(f=>f.path==='target.cjs')?.metrics.literals);
    });
  }
}

for(const [name,source] of [
  ['Number literal prototype charCodeAt',
    'const p=(7).constructor.prototype;p.charCodeAt=()=>0;'],
  ['Boolean literal prototype charCodeAt',
    'const p=(true).constructor.prototype;p.charCodeAt=()=>0;'],
  ['Number literal constructor method',
    "const C=(7).constructor;C.fromCharCode=()=>'!';"],
  ['read-only dynamic String constructor',
    'const C=(JSON.stringify(0)).constructor;const f=C.fromCharCode;'],
  ['unrelated runtime constructor key',
    'const C=(JSON.stringify(0)).constructor;C.unrelatedAppField=42;']
]){
  for(const mode of /** @type {const} */ (['coo','sno'])){
    test('safe constructor alias retains actual private literal work: '+name+'/'+mode,async()=>{
      const files=bundle(source);
      const output=obfuscateFiles(files,{
        mode,seed:'agent9-opaque-primitive-ctor-positive/'+name+'/'+mode,
        strings:true,identifiers:false,properties:false
      });
      assert.ok(output.files.find(f=>f.path==='target.cjs')?.metrics.literals,
        name+'/'+mode+' unexpectedly suppressed decoder work');
      assert.deepEqual(await run(output.files),await run(files));
    });
  }
}
