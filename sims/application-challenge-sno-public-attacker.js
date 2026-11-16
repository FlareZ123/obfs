'use strict';

// This adversary intentionally imports no obfuscator library, original source,
// build fixture or generated seed. It receives only a public SNO distribution,
// chosen input cases and the installed Node.js runtime.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');

/** @param {string|Buffer} data @returns {string} */
function digest(data){
  return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {string} executable
 * @param {number[][]} cases
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(executable,cases){
  const child=spawnSync(process.execPath,[executable,JSON.stringify(cases)],{
    encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * Copy every visible package file into a separate filesystem root using
 * temporary-file replacement. The original distribution remains untouched.
 * @param {string} publicDir
 * @param {string} target
 * @returns {string[]}
 */
function copyDistribution(publicDir,target){
  const names=fs.readdirSync(publicDir).sort();
  assert.ok(names.includes('sno-entry.cjs'));
  assert.ok(names.includes('entry.mjs'));
  for(const name of names){
    const source=path.join(publicDir,name);
    if(!fs.statSync(source).isFile())throw Error('Expected flat public SNO distribution');
    const destination=path.join(target,name);
    const intermediate=destination+'.partial';
    fs.writeFileSync(intermediate,fs.readFileSync(source),{flag:'wx'});
    fs.renameSync(intermediate,destination);
  }
  return names;
}

/**
 * No original compiler is needed to bypass a self-contained, public SHA-256
 * manifest: it carries both its expected digests and its verification logic.
 * @param {string} target
 * @param {number[][]} cases
 * @returns {{rejected:boolean,modifiedOutput:string}}
 */
function forgeManifest(target,cases){
  const entry=path.join(target,'entry.mjs');
  const launcher=path.join(target,'sno-entry.cjs');
  const original=fs.readFileSync(entry,'utf8');
  const originalManifest=fs.readFileSync(launcher,'utf8');
  const tampered='process.stdout.write("FORGED\\n");process.exit(0);\n'+original;
  const tempEntry=entry+'.partial';
  fs.writeFileSync(tempEntry,tampered,{flag:'wx'});
  fs.renameSync(tempEntry,entry);

  const denied=execute(launcher,cases);
  assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/Integrity check failed: entry\.mjs/);

  const oldDigest=digest(original);
  assert.equal(originalManifest.split(oldDigest).length-1,1);
  const rewritten=originalManifest.replace(oldDigest,digest(tampered));
  const tempLauncher=launcher+'.partial';
  fs.writeFileSync(tempLauncher,rewritten,{flag:'wx'});
  fs.renameSync(tempLauncher,launcher);
  const forged=execute(launcher,cases);
  assert.equal(forged.status,0,forged.stderr);
  assert.equal(forged.stdout,'FORGED\n');
  return {rejected:true,modifiedOutput:forged.stdout};
}

/**
 * @param {string} publicDir
 * @param {number[][]} cases
 * @returns {{copiedFiles:number,publicOutputSha256:string,copiedOutputSha256:string,copyMatches:boolean,modificationRejected:boolean,manifestRewritten:boolean}}
 */
function runAttack(publicDir,cases){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sno-public-attacker-'));
  try{
    const entry=path.join(publicDir,'sno-entry.cjs');
    const publicRun=execute(entry,cases);
    assert.equal(publicRun.status,0,publicRun.stderr);
    const names=copyDistribution(publicDir,root);
    const clone=execute(path.join(root,'sno-entry.cjs'),cases);
    assert.equal(clone.status,0,clone.stderr);
    assert.equal(clone.stdout,publicRun.stdout);
    const forged=forgeManifest(root,cases);
    return {
      copiedFiles:names.length,
      publicOutputSha256:digest(publicRun.stdout),
      copiedOutputSha256:digest(clone.stdout),
      copyMatches:clone.stdout===publicRun.stdout,
      modificationRejected:forged.rejected,
      manifestRewritten:forged.modifiedOutput==='FORGED\n'
    };
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  try{
    const directory=process.argv[2];
    const cases=JSON.parse(process.argv[3]||'[]');
    if(!directory||!Array.isArray(cases))throw Error('Expected distribution folder and JSON cases');
    const output=runAttack(path.resolve(directory),cases);
    process.stdout.write('SNO_PUBLIC_ATTACK '+JSON.stringify(output)+'\n');
  }catch(error){
    console.error(error);
    process.exitCode=1;
  }
}

module.exports={runAttack};
