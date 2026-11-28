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
const payload='A'.repeat(2048)+'Z';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-producer-'));
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

/** @param {string} side @returns {SourceFile[]} */
function files(side){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(payload)+';'}
  ];
}

/** @type {Array<[string,string]>} */
const producers=[
  ['Array.of', 'Array.of(1)'],
  ['Array.from', "Array.from('a')"],
  ['Array.slice', '[1].slice()'],
  ['String.split', "'a'.split('')"],
  ['JSON.parse array', "JSON.parse('[]')"],
  ['Object.keys', 'Object.keys({a:1})'],
  ['Object.entries', 'Object.entries({a:1})'],
  ['Array constructor', 'Array(2)']
];

for(const [name,expression] of producers){
  for(const mode of /** @type {const} */ (['sno','coo'])){
    test('dynamic array producer must not corrupt chunked decoder spread: '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const mutator='const value=('+expression+');'+
        'value.__proto__[Symbol.iterator]=function*(){yield 0;};';
      const source=files(mutator);
      const native=await run(source);
      assert.equal(native.status,0,'invalid native array fixture '+name+': '+native.stderr);
      assert.equal(native.stdout,payload,
        'mutating Array.prototype must not change the original literal');
      const output=obfuscateFiles(source,{
        mode,seed:'agent9-dynamic-array-prototype/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      const emitted=await run(output.files);
      assert.deepEqual(emitted,native,
        name+'/'+mode+' corrupted chunked decoder; target metrics.literals='+
        output.files.find(f=>f.path==='target.cjs')?.metrics.literals);
    });
  }
}

test('independent source remains eligible for the chunked decoder',()=>{
  for(const mode of /** @type {const} */ (['sno','coo'])){
    const target=files('')[2];
    const emitted=obfuscateFiles([target],{
      mode,seed:'agent9-dynamic-array-prototype-control/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(emitted.files[0].metrics.literals>0);
  }
});
