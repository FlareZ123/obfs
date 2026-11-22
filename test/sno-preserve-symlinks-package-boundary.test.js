'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * Load an actual SNO launcher through its linked path, with explicit
 * Node runtime resolution flags. The integrity preflight remains intact.
 * @param {string} launcher
 * @param {string[]} flags
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function execute(launcher,flags) {
  return spawnSync(process.execPath,[
    ...flags,'--eval',
    'process.stdout.write(JSON.stringify(require(process.argv[1])))',
    launcher
  ],{encoding:'utf8',timeout:15000});
}

test('SNO canonical build check cannot assert --preserve-symlinks deployment semantics',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-preserve-links-'));
  try {
    const input=path.join(temp,'source');
    const actual=path.join(temp,'actual');
    const host=path.join(temp,'esm-host');
    const alias=path.join(host,'alias');
    await atomicWrite(path.join(input,'entry.js'),'module.exports=314;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await fs.mkdir(actual,{recursive:true});
    try {
      await fs.symlink(actual,alias,process.platform==='win32'?'junction':'dir');
    } catch(error) {
      if(process.platform==='win32' &&
          ['EPERM','EACCES'].includes(
            /** @type {NodeJS.ErrnoException} */(error).code||'')) {
        t.skip('Creating a Windows junction is unavailable');
        return;
      }
      throw error;
    }
    const out=path.join(alias,'dist');
    await main('sno',['--root',input,'--entry','entry.js','--out',out,
      '--seed','preserve-link-package-context']);

    const launcher=path.join(out,'sno-entry.cjs');
    const baseline=execute(launcher,[]);
    assert.equal(baseline.status,0,baseline.stderr);
    assert.equal(baseline.stdout,'314',
      'The default realpath-based Node loader matches the compiler proof');

    const overridden=execute(launcher,['--preserve-symlinks']);
    assert.ok(overridden.status!==0||overridden.stdout!=='314',
      'Preserving the symlink path makes an ESM host package visible to Node');
    assert.doesNotMatch(overridden.stderr,/Integrity check failed/u,
      'The mismatch must not depend on modifying the SNO manifest');

    const mainOnly=execute(launcher,['--preserve-symlinks-main']);
    assert.equal(mainOnly.status,0,mainOnly.stderr);
    assert.equal(mainOnly.stdout,'314',
      'Only --preserve-symlinks changes the nested CommonJS require path');
  }finally{
    await fs.rm(temp,{recursive:true,force:true});
  }
});
