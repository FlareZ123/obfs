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

/** @type {{name:string,loader:string,alias?:string}[]} */
const cases=[
  {name:'module.require',loader:"module.require('./observer.cjs')"},
  {name:'require const alias',loader:"loadObserver('./observer.cjs')",
    alias:'const loadObserver=require;'},
  {name:'require.main.require',loader:"require.main.require('./observer.cjs')"},
  {name:'process.mainModule.require',loader:"process.mainModule.require('./observer.cjs')"}
];

/** @param {string} dir @param {string} entry @returns {Promise<{status:number|null,stdout:string,stderr:string}>} */
async function run(dir,entry){
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'observer.cjs'),observer,'utf8');
  await fs.writeFile(path.join(dir,'entry.cjs'),entry,'utf8');
  const p=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(p.error)throw p.error;
  return {status:p.status,stdout:p.stdout,stderr:p.stderr};
}

for(const {name,loader,alias} of cases){
  test('opaque CJS aliased loader default-pipeline source parity: '+name,async()=>{
    const original=[
      ...(alias?[alias]:[]),
      'const inspect='+loader+';',
      'const privateData={secretField:17,bonusField:5};',
      'const conspicuousLongString="XYZ_LONG_STRING_CONTRACT_abcdefghijklmnopqrstuvwxyz0123456789";',
      'process.stdout.write(JSON.stringify([',
      'privateData.secretField+privateData.bonusField,conspicuousLongString,inspect()]));'
    ].join('\n');
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{mode:'sno',seed:'cjs-loader-default/'+name});
    const out=compiled.files[0];
    assert.ok(out.metrics.bindings+out.metrics.literals+out.metrics.properties>0,
      'The original default pipeline is expected to alter source without the external module proof');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-loader-default-'));
    try{
      const native=await run(path.join(root,'native'),original);
      const generated=await run(path.join(root,'generated'),String(out.code));
      assert.equal(native.status,0,native.stderr);
      assert.equal(generated.status,0,generated.stderr);
      assert.deepEqual(generated,native,
        'Source bytes of a native CJS wrapper are observable through an uncompiled loader alias');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}
