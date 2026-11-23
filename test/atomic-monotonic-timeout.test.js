'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * Hold an actual lock from the parent process, then test expiry in a child.
 * Isolating the wall-clock patch avoids contaminating Node's test runner.
 */
test('lock timeout remains bounded when Date.now is frozen',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-monotonic-lock-'));
  const destination=path.join(directory,'artifact.js');
  const lock=await fs.open(destination+'.lock','wx',0o600);
  try {
    const script=[
      "'use strict';",
      'Date.now=()=>0;',
      'const {atomicWrite}=require(process.argv[1]);',
      "atomicWrite(process.argv[2],'replacement',{timeoutMs:80})",
      "  .then(()=>{process.stderr.write('Unexpected lock acquisition');process.exitCode=1;})",
      "  .catch(error=>{if(error.code==='EEXIST')process.stdout.write('TIMED_OUT');",
      '    else {process.stderr.write(String(error));process.exitCode=1;}});'
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '-e',script,require.resolve('../src/atomic'),destination
    ],{encoding:'utf8',timeout:3000});
    assert.equal(child.error,undefined,
      'Lock deadline did not expire: '+String(child.error));
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout,'TIMED_OUT');
    assert.deepEqual(await fs.readdir(directory),['artifact.js.lock']);
  }finally {
    await lock.close();
    await fs.rm(directory,{recursive:true,force:true});
  }
});
