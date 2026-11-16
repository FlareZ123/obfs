'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {obfuscateFiles,createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES}=require('../examples/application-challenge/build.cjs');

const SEED='application-challenge-sno-20261116';
const ENTRY='entry.cjs';
const BOOT="'use strict';\nimport('./entry.mjs').catch(error=>{console.error(error);process.exitCode=1;});\n";

/** @param {string|Buffer} data @returns {string} */
function sha256(data){
  return createHash('sha256').update(data).digest('hex');
}

/** @returns {number[][]} */
function heldoutCases(){
  return [
    [0,0],[0,1],[1,1],[4294967295,0],[4294967295,3],
    ...Array.from({length:80},(_,i)=>[
      (Math.imul(i+0x1234,0x9e3779b1)^(i<<7))>>>0,
      (i*317)%5000
    ])
  ];
}

/**
 * Compile exactly the frozen ESM application with one CommonJS SNO entry.
 * ESM modules remain .mjs and execute through Node dynamic import, while
 * sno-entry.cjs is the only OS-invoked entry point. No source is edited.
 * @param {string} destination
 * @returns {Promise<{paths:string[],launcher:string,changed:number,originalBytes:number,emittedBytes:number,encoded:number,properties:number,bindings:number}>}
 */
async function emitSno(destination){
  const originals=await Promise.all(NAMES.map(async name=>({
    path:name,
    sourceType:/** @type {'module'} */('module'),
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const sourceFiles=[
    ...originals,
    {path:ENTRY,sourceType:/** @type {'commonjs'} */('commonjs'),code:BOOT}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'sno',seed:SEED,closedWorld:false,
    strings:true,identifiers:true,properties:true
  });
  const launcher=createSnoLauncher(compiled.files,ENTRY);
  for(const file of compiled.files){
    await atomicWrite(path.join(destination,file.path),file.code);
  }
  await atomicWrite(path.join(destination,'sno-entry.cjs'),launcher);
  return {
    paths:compiled.files.map(file=>file.path),
    launcher,
    changed:compiled.files.filter((file,i)=>file.code!==sourceFiles[i].code).length,
    originalBytes:originals.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
    emittedBytes:compiled.files.filter(file=>NAMES.includes(file.path)).reduce(
      (sum,file)=>sum+Buffer.byteLength(file.code),0),
    encoded:compiled.files.reduce((sum,file)=>sum+file.metrics.literals,0),
    properties:compiled.crossFile.properties+compiled.files.reduce(
      (sum,file)=>sum+file.metrics.properties,0),
    bindings:compiled.files.reduce((sum,file)=>sum+file.metrics.bindings,0)
  };
}

/**
 * Run an entry as an isolated Node process. The attacker only requires
 * the distributed files and a Node runtime.
 * @param {string} entry
 * @param {number[][]} cases
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function runRaw(entry,cases){
  const child=spawnSync(process.execPath,[entry,JSON.stringify(cases)],{
    encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} entry @param {number[][]} cases @returns {unknown} */
function runJson(entry,cases){
  const child=runRaw(entry,cases);
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}

/**
 * Run native, transformed, copied and forged variants for the same app.
 * All generated data lives in disposable temporary directories.
 * @returns {Promise<{cases:number,offlineCloneMatches:boolean,changedFiles:number,originalBytes:number,emittedBytes:number,encodedLiterals:number,renamedProperties:number,renamedBindings:number,manifestRejected:boolean,forgedExecution:boolean}>}
 */
async function runEvidence(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-frozen-sno-'));
  try {
    const protectedDir=path.join(temp,'protected');
    const compiled=await emitSno(protectedDir);
    const cases=heldoutCases();
    const native=runJson(path.join(ROOT,'before','entry.mjs'),cases);
    assert.deepEqual(runJson(path.join(protectedDir,'sno-entry.cjs'),cases),native);
    const attacker=spawnSync(process.execPath,[
      path.join(__dirname,'application-challenge-sno-public-attacker.js'),
      protectedDir,JSON.stringify(cases)
    ],{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
    if(attacker.error)throw attacker.error;
    assert.equal(attacker.status,0,attacker.stderr);
    assert.match(attacker.stdout,/^SNO_PUBLIC_ATTACK /);
    const attack=/** @type {{copiedFiles:number,publicOutputSha256:string,copiedOutputSha256:string,copyMatches:boolean,modificationRejected:boolean,manifestRewritten:boolean}} */(
      JSON.parse(attacker.stdout.slice('SNO_PUBLIC_ATTACK '.length)));
    assert.equal(attack.copiedFiles,compiled.paths.length+1);
    assert.equal(attack.publicOutputSha256,sha256(JSON.stringify(native)+'\n'));
    assert.equal(attack.copiedOutputSha256,attack.publicOutputSha256);
    return {
      cases:cases.length,
      offlineCloneMatches:attack.copyMatches,
      changedFiles:compiled.changed,
      originalBytes:compiled.originalBytes,
      emittedBytes:compiled.emittedBytes,
      encodedLiterals:compiled.encoded,
      renamedProperties:compiled.properties,
      renamedBindings:compiled.bindings,
      manifestRejected:attack.modificationRejected,
      forgedExecution:attack.manifestRewritten
    };
  } finally {
    await fs.rm(temp,{recursive:true,force:true});
  }
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Paired whole-process wall times include Node startup, SNO hash
 * verification, ESM import, eager decoder initialization and application
 * computation. Compilation at build time is deliberately excluded.
 * @param {number} [rounds]
 * @returns {Promise<{workload:string,nativeMs:number,snoMs:number,ratio:number}[]>}
 */
async function profile(rounds=9){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-frozen-sno-profile-'));
  try {
    await emitSno(temp);
    const native=path.join(ROOT,'before','entry.mjs');
    const sno=path.join(temp,'sno-entry.cjs');
    const workloads=[
      {name:'one-event',cases:[[0x9e3779b9,1]]},
      {name:'120k-events',cases:[[0x9e3779b9,120000]]}
    ];
    const output=[];
    for(const workload of workloads){
      const nativeMs=[];
      const snoMs=[];
      const expected=runJson(native,workload.cases);
      assert.deepEqual(runJson(sno,workload.cases),expected);
      for(let i=0;i<rounds;i++){
        for(const isSno of i%2===0?[false,true]:[true,false]){
          const start=process.hrtime.bigint();
          const result=runJson(isSno?sno:native,workload.cases);
          const elapsed=Number(process.hrtime.bigint()-start)/1e6;
          assert.deepEqual(result,expected);
          (isSno?snoMs:nativeMs).push(elapsed);
        }
      }
      const base=median(nativeMs);
      const transformed=median(snoMs);
      output.push({
        workload:workload.name,nativeMs:base,snoMs:transformed,
        ratio:transformed/base
      });
    }
    return output;
  } finally {
    await fs.rm(temp,{recursive:true,force:true});
  }
}

if(require.main===module){
  (async()=>{
    const evidence=await runEvidence();
    process.stdout.write('APPLICATION_SNO_EVIDENCE '+JSON.stringify(evidence)+'\n');
    if(process.argv.includes('--profile')){
      process.stdout.write('APPLICATION_SNO_PROFILE '+
        JSON.stringify(await profile())+'\n');
    }
  })().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={emitSno,runEvidence,profile,heldoutCases};
