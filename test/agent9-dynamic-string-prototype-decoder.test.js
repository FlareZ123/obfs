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
const payload='R'.repeat(2048)+'D';

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-strproto-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',timeout:15000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(payload)+';'}
  ];
}

/** @type {Array<[string,string]>} */
const producers=[
  ['String call', "String('x')"],
  ['Object string wrapper call', "Object('x')"],
  ['string concatenation', "('x'+'y')"],
  ['JSON.stringify', 'JSON.stringify(0)'],
  ['String.fromCharCode', 'String.fromCharCode(88)'],
  ['primitive .repeat call', "'x'.repeat(2)"],
  ['String.raw tagged template', 'String.raw`x`'],
  ['interpolated template', '`x${1}`'],
  ['URLSearchParams.toString', "new URLSearchParams({x:'a'}).toString()"],
  ['Buffer.toString', "Buffer.from('x').toString()"]
];

for(const [name,expression] of producers){
  for(const mode of /** @type {const} */ (['sno','coo'])){
    test('dynamic string primitive prototype mutation must not corrupt decoder: '+name+'/'+mode,{
      timeout:30000
    },async()=>{
      const mutator='const p=('+expression+').__proto__;p.charCodeAt=()=>0;';
      const input=graph(mutator);
      const native=await run(input);
      assert.deepEqual(native,{status:0,stdout:payload,stderr:''},
        name+' native fixture: '+native.stderr);
      const output=obfuscateFiles(input,{
        mode,seed:'agent9-dynamic-string-prototype/'+name+'/'+mode,
        strings:true,properties:false,identifiers:false
      });
      const generated=await run(output.files);
      const metric=output.files.find(file=>file.path==='target.cjs')?.metrics.literals;
      assert.deepEqual(generated,native,
        name+'/'+mode+' decoder used a mutated String.prototype'+
        '; emitted target literal count='+metric);
    });
  }
}

test('long target is ordinarily eligible for chunked string decoding',()=>{
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles([graph('')[2]],{
      mode,seed:'agent9-dynamic-string-prototype-negative-control/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(output.files[0].metrics.literals>0);
  }
});
