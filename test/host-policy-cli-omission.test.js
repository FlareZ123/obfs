'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * Check executable CLI behavior rather than merely inspecting readArgs.
 * The CLI intentionally omits allowedHosts unless --host is supplied.
 */
test('COO and SNO default CLI builds remain valid without a --host option',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-cli-'));
  try{
    const browserRoot=path.join(root,'browser');
    const serverRoot=path.join(root,'server');
    const browserOut=path.join(root,'coo-out');
    const serverOut=path.join(root,'sno-out');
    await fs.mkdir(browserRoot);
    await fs.mkdir(serverRoot);
    await atomicWrite(path.join(browserRoot,'client.js'),
      'globalThis.hostCliValue=23;');
    await atomicWrite(path.join(serverRoot,'server.cjs'),
      'module.exports={answer:41};');

    await main('coo',['--root',browserRoot,'--entry','client.js',
      '--out',browserOut,'--seed','coo-cli-no-host']);
    const browserCode=await fs.readFile(
      path.join(browserOut,'client.js'),'utf8');
    assert.ok(browserCode.length>0);
    assert.doesNotMatch(browserCode,/Unauthorized execution host/);

    await main('sno',['--root',serverRoot,'--entry','server.cjs',
      '--out',serverOut,'--seed','sno-cli-no-host']);
    const launcher=path.join(serverOut,'sno-entry.cjs');
    const run=spawnSync(process.execPath,[launcher],{
      encoding:'utf8',timeout:5000
    });
    if(run.error)throw run.error;
    assert.equal(run.status,0,run.stderr);
    assert.equal(run.stderr,'');
    assert.ok((await fs.stat(path.join(serverOut,'server.cjs'))).isFile());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
