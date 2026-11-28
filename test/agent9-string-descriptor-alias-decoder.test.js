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
const payload='T'.repeat(2048)+'R';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-string-desc-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const p=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',timeout:15000,windowsHide:true
    });
    if(p.error)throw p.error;
    return {status:p.status,stdout:p.stdout,stderr:p.stderr};
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
      code:'module.exports='+JSON.stringify(payload)+';'}
  ];
}

/** @type {Array<[string,string]>} */
const accessors=[
  ['String descriptor value',
    "Object.getOwnPropertyDescriptor(String,'prototype').value"],
  ['String descriptor map value',
    'Object.getOwnPropertyDescriptors(String).prototype.value'],
  ['Reflect.get String prototype',
    "Reflect.get(String,'prototype')"],
  ['String alias descriptor value',
    "Object.getOwnPropertyDescriptor(globalThis.String,'prototype').value"],
  ['String alias Reflect.get',
    "Reflect.get(globalThis.String,'prototype')"]
];

for(const [name,expression] of accessors){
  for(const mode of /** @type {const} */ (['sno','coo'])){
    test('String.prototype descriptor/value alias must preserve eager decoder: '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const mutator='const p=('+expression+');p.charCodeAt=()=>0;';
      const input=graph(mutator);
      const native=await run(input);
      assert.deepEqual(native,{status:0,stdout:payload,stderr:''});
      const out=obfuscateFiles(input,{
        mode,seed:'agent9-descriptor-prototype/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      const emitted=await run(out.files);
      assert.deepEqual(emitted,native,
        name+'/'+mode+' intrinsic descriptor alias changed decoder bytes; '+
        'literal metrics='+out.files.find(f=>f.path==='target.cjs')?.metrics.literals);
    });
  }
}

for(const [name,source] of [
  ['Number descriptor read-only',
    "const p=Object.getOwnPropertyDescriptor(Number,'prototype').value;const f=p.toString;"],
  ['Number descriptor unrelated write',
    "const p=Object.getOwnPropertyDescriptor(Number,'prototype').value;p.unrelated=13;"],
  ['Number Reflect unrelated write',
    "const p=Reflect.get(Number,'prototype');p.unrelated=13;"]
]){
  for(const mode of /** @type {const} */ (['sno','coo'])){
    test('unrelated Number descriptor retains decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(source);
      const out=obfuscateFiles(input,{
        mode,seed:'agent9-descriptor-prototype-positive/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      assert.ok(out.files.find(file=>file.path==='target.cjs')?.metrics.literals,
        name+'/'+mode+' unexpectedly suppressed independent string encoder');
      assert.deepEqual(await run(out.files),await run(input));
    });
  }
}
