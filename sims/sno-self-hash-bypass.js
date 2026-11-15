'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles,createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{original:string,blocked:string,bypassed:string,originalLauncherHash:string,patchedLauncherHash:string,originalEntryHash:string,patchedEntryHash:string}} TamperEvidence */

/**
 * Demonstrate local self-hash bypass under the stipulated SNO adversary's
 * complete filesystem ownership. The attacker changes only distributed
 * artifacts and can calculate their public SHA-256 digests independently.
 * @returns {Promise<TamperEvidence>}
 */
async function runSnoSelfHashBypass() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-owner-bypass-'));
  try {
    const output=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',
        code:"const policy=require('./policy.cjs');console.log(JSON.stringify({access:policy.allow()}));"},
      {path:'policy.cjs',sourceType:'commonjs',code:'exports.allow=()=>false;'}
    ],{mode:'sno',strings:false,seed:'sno-attacker-evidence'});
    const originals=output.files.map(file=>({
      path:file.path,
      code:/** @type {string} */ (file.code)
    }));
    const entry=originals.find(file=>file.path==='entry.cjs');
    assert.ok(entry);
    const launcher=createSnoLauncher(originals,'entry.cjs');
    for(const file of originals)await atomicWrite(path.join(directory,file.path),file.code);
    const launcherPath=path.join(directory,'sno-entry.cjs');
    await atomicWrite(launcherPath,launcher);

    /**
     * Invoke the generated launcher through a fresh actual Node process.
     * @returns {{status:number|null,stdout:string,stderr:string}}
     */
    function execute() {
      const child=spawnSync(process.execPath,[launcherPath],{
        encoding:'utf8',timeout:10000
      });
      if(child.error)throw child.error;
      return {status:child.status,stdout:child.stdout,stderr:child.stderr};
    }

    const baseline=execute();
    assert.equal(baseline.status,0,baseline.stderr);
    assert.deepEqual(JSON.parse(baseline.stdout),{access:false});

    // Attacker controls only the protected on-disk entry and the launcher.
    // A changed entry with the original self-hash must fail loudly.
    const malicious="console.log(JSON.stringify({access:true}));";
    await atomicWrite(path.join(directory,'entry.cjs'),malicious);
    const blocked=execute();
    assert.notEqual(blocked.status,0);
    assert.match(blocked.stderr,/Integrity check failed: entry\.cjs/);

    // No hash collision or cryptographic preimage is needed because the same
    // untrusted filesystem holds both the executable and the expected hash.
    const originalEntryHash=createHash('sha256').update(entry.code).digest('hex');
    const patchedEntryHash=createHash('sha256').update(malicious).digest('hex');
    assert.equal(launcher.split(originalEntryHash).length,2,
      'Expected one public entry digest in launcher manifest');
    const patchedLauncher=launcher.replace(originalEntryHash,patchedEntryHash);
    await atomicWrite(launcherPath,patchedLauncher);
    const bypassed=execute();
    assert.equal(bypassed.status,0,bypassed.stderr);
    assert.deepEqual(JSON.parse(bypassed.stdout),{access:true});

    return {
      original:baseline.stdout.trim(),
      blocked:blocked.stderr.includes('Integrity check failed')?'integrity-rejected':'unexpected',
      bypassed:bypassed.stdout.trim(),
      originalLauncherHash:createHash('sha256').update(launcher).digest('hex'),
      patchedLauncherHash:createHash('sha256').update(patchedLauncher).digest('hex'),
      originalEntryHash,patchedEntryHash
    };
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module)runSnoSelfHashBypass()
  .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
  .catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;});

module.exports={runSnoSelfHashBypass};
