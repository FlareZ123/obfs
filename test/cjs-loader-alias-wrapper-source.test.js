'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const observer=[
  'function inspect(){',
  '  return Function.prototype.toString.call(inspect.caller);',
  '}',
  'module.exports=inspect;'
].join('\n');

/** @type {{label:string,expression:string}[]} */
const loaders=[
  {label:'Module.require method',expression:"module.require('./observer.cjs')"},
  {label:'unique const require alias',expression:"loader('./observer.cjs')"},
  {label:'process.mainModule.require',expression:"process.mainModule.require('./observer.cjs')"},
  {label:'require.main.require',expression:"require.main.require('./observer.cjs')"}
];

/**
 * @param {string} dir
 * @param {string} entry
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(dir,entry){
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'entry.cjs'),entry,'utf8');
  await fs.writeFile(path.join(dir,'observer.cjs'),observer,'utf8');
  const p=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(p.error)throw p.error;
  return {status:p.status,stdout:p.stdout,stderr:p.stderr};
}

for(const {label,expression} of loaders){
  test('opaque CJS loader alias and implicit wrapper source: '+label,async()=>{
    const original=[
      ...(label==='unique const require alias'?['const loader=require;']:[]),
      'const foreign='+expression+';',
      'const owner={secretField:17,bonusField:5};',
      'process.stdout.write(JSON.stringify([owner.secretField+owner.bonusField,foreign()]));'
    ].join('\n');
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{
      mode:'sno',seed:'cjs-wrapper-loader-alias/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(output.files.length,1);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-loader-alias-'));
    try{
      const native=await run(path.join(root,'native'),original);
      const generated=await run(path.join(root,'generated'),String(output.files[0].code));
      assert.equal(native.status,0,native.stderr);
      assert.equal(generated.status,0,generated.stderr);
      assert.deepEqual(generated,native,
        'A native Module loader alias may import an uncompiled source observer');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}
