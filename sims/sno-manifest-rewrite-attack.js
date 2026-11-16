'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const {obfuscateFiles} = require('../src');
const {createSnoLauncher} = require('../src/sno');
const {atomicWrite} = require('../src/atomic');

/**
 * Execute the actual SNO launcher in a separate Node process.
 * @param {string} directory
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(directory) {
  const entry=path.join(directory,'sno-entry.cjs');
  const child=spawnSync(process.execPath,[
    '-e','process.stdout.write(JSON.stringify(require(process.argv[1])()))',entry
  ],{encoding:'utf8',timeout:10000});
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * Attacker-side manifest rewrite requiring only distributed SNO bytes.
 * No compiler, original source, build seed or signing key is accessed.
 * It leaves the original SHA-256 verification loop intact, replacing only
 * the manifest's expected digests with those of attacker-controlled files.
 * @param {string} directory
 * @returns {Promise<{digests:number,elapsedMs:number}>}
 */
async function rewritePublicManifest(directory) {
  const launcherPath=path.join(directory,'sno-entry.cjs');
  const launcher=await fs.readFile(launcherPath,'utf8');
  const match=/\bconst checks=(\[[^\r\n;]*\]);/u.exec(launcher);
  if(!match)throw new Error('SNO launcher manifest was not found');
  /** @type {unknown} */
  const parsed=JSON.parse(match[1]);
  if(!Array.isArray(parsed) || !parsed.every(item=>Array.isArray(item) &&
    item.length===2 && typeof item[0]==='string' && typeof item[1]==='string')) {
    throw new TypeError('SNO launcher manifest has an unexpected schema');
  }
  const began=performance.now();
  /** @type {[string,string][]} */
  const updated=[];
  for(const [name] of /** @type {[string,string][]} */(parsed)) {
    const bytes=await fs.readFile(path.join(directory,name));
    updated.push([name,createHash('sha256').update(bytes).digest('hex')]);
  }
  const replacement='const checks='+JSON.stringify(updated)+';';
  const rewritten=launcher.slice(0,match.index)+replacement+
    launcher.slice(match.index+match[0].length);
  await atomicWrite(launcherPath,rewritten);
  return {digests:updated.length,elapsedMs:performance.now()-began};
}

/**
 * Build a real two-module obfuscated SNO bundle and demonstrate three states:
 * (1) original passes; (2) mutation fails; (3) public manifest rewrite passes.
 * @returns {Promise<{native:string,protected:string,mutationRejected:boolean,
 *                   bypassed:string,attackerMs:number,digests:number}>}
 */
async function runEvidence() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-manifest-'));
  try {
    const nativeFiles=[
      {path:'entry.cjs',sourceType:/** @type {'commonjs'} */('commonjs'),
        code:"const helper=require('./helper.cjs');module.exports=()=>helper.compute(3);"},
      {path:'helper.cjs',sourceType:/** @type {'commonjs'} */('commonjs'),
        code:'exports.compute=value=>value*13;'}
    ];
    const nativeDirectory=path.join(directory,'native');
    const transformedDirectory=path.join(directory,'distributed');
    for(const file of nativeFiles)await atomicWrite(path.join(nativeDirectory,file.path),file.code);
    const nativeChild=spawnSync(process.execPath,[
      '-e','process.stdout.write(JSON.stringify(require(process.argv[1])()))',
      path.join(nativeDirectory,'entry.cjs')
    ],{encoding:'utf8',timeout:10000});
    assert.equal(nativeChild.status,0,nativeChild.stderr);
    const transformed=obfuscateFiles(nativeFiles,{
      mode:'sno',seed:'manifest-attack-fixed-reproduction-seed'
    });
    for(const file of transformed.files) {
      assert.equal(typeof file.code,'string');
      await atomicWrite(path.join(transformedDirectory,file.path),file.code);
    }
    await atomicWrite(path.join(transformedDirectory,'sno-entry.cjs'),
      createSnoLauncher(transformed.files,'entry.cjs'));
    const protectedRun=execute(transformedDirectory);
    assert.equal(protectedRun.status,0,protectedRun.stderr);
    assert.equal(protectedRun.stdout,nativeChild.stdout);
    // An attacker with filesystem access can replace the exported entry value.
    const entryPath=path.join(transformedDirectory,'entry.cjs');
    const originalOutput=await fs.readFile(entryPath,'utf8');
    await atomicWrite(entryPath,originalOutput+'\nmodule.exports=()=>999;\n');
    const rejected=execute(transformedDirectory);
    assert.notEqual(rejected.status,0);
    assert.match(rejected.stderr,/Integrity check failed: entry\.cjs/u);
    const attack=await rewritePublicManifest(transformedDirectory);
    const bypassed=execute(transformedDirectory);
    assert.equal(bypassed.status,0,bypassed.stderr);
    assert.equal(bypassed.stdout,'999');
    const finalLauncher=await fs.readFile(path.join(transformedDirectory,'sno-entry.cjs'),'utf8');
    assert.match(finalLauncher,/for\(const \[file,expected\] of checks\)/u);
    return {
      native:nativeChild.stdout,protected:protectedRun.stdout,
      mutationRejected:true,bypassed:bypassed.stdout,
      attackerMs:attack.elapsedMs,digests:attack.digests
    };
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

module.exports={rewritePublicManifest,runEvidence};

if(require.main===module){
  runEvidence().then(result=>{
    console.log('SNO_MANIFEST_ATTACK '+JSON.stringify(result));
  },error=>{console.error(error);process.exitCode=1;});
}
