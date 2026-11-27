'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite,withDirectoryLock}=require('../src/atomic');

test('publisher rejects invalid timeout values before writing or running an action',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-invalid-lock-timeout-'));
  const output=path.join(root,'entry.js');
  let executed=0;
  try{
    for(const timeoutMs of [NaN,Infinity,-Infinity,-1]){
      await assert.rejects(
        atomicWrite(output,'incorrect',{timeoutMs}),
        {name:'TypeError',message:/timeoutMs/u}
      );
      await assert.rejects(fs.stat(output),{code:'ENOENT'});
      await assert.rejects(
        withDirectoryLock(root,async()=>{executed++;},{timeoutMs}),
        {name:'TypeError',message:/timeoutMs/u}
      );
      assert.equal(executed,0);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('NaN timeout cannot strand a publisher behind an occupied lock',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nan-lock-deadline-'));
  const output=path.join(root,'entry.js');
  const lock=await fs.open(output+'.lock','wx',0o600);
  try{
    const child=[
      "'use strict';",
      'const {atomicWrite}=require(process.argv[1]);',
      "atomicWrite(process.argv[2],'incorrect',{timeoutMs:NaN})",
      "  .then(()=>{process.stderr.write('unexpected write');process.exitCode=1;})",
      "  .catch(error=>{if(error instanceof TypeError)process.stdout.write('INVALID');",
      '    else {process.stderr.write(String(error));process.exitCode=1;}});'
    ].join('\n');
    const run=spawnSync(process.execPath,[
      '-e',child,require.resolve('../src/atomic'),output
    ],{encoding:'utf8',timeout:1800});
    assert.equal(run.error,undefined,
      'NaN lock timeout did not reject: '+String(run.error));
    assert.equal(run.status,0,run.stderr);
    assert.equal(run.stdout,'INVALID');
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  }finally{
    await lock.close();
    await fs.rm(root,{recursive:true,force:true});
  }
});
