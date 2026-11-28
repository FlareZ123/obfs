'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{workMs:number,workCpuMs:number,wallMs:number,digest:number,source:string}} Sample */

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * True two-way runtime comparison of a static ESM source-observer graph. The
 * one original private leaf is transformed while a separate watched function
 * retains its exact original source spelling.
 * 
 * @param {number} iterations
 * @returns {SourceFile[]}
 */
function application(iterations){
  return [
    {path:'watched.mjs',sourceType:'module',
      code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'},
    {path:'independent.mjs',sourceType:'module',
      code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;export function unrelated(){return valueB;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {watched} from "./watched.mjs";'+
        'import {unrelated} from "./independent.mjs";'+
        'export const answer={source:watched.toString(),value:unrelated()};'}
  ];
}

/**
 * Generate a trusted host-side measurement adapter. It is deliberately not
 * included in the compiled source group: a program's benchmark must not
 * receive a synthetic unproved `performance` global as an implicit capability.
 * The timed function is the same native ESM export in both directories, and
 * the unchanged ESM entry still observes the watched function's source.
 *
 * @param {number} iterations
 * @returns {string}
 */
function measurementAdapter(iterations) {
  return [
    'import {performance} from "node:perf_hooks";',
    'import {answer} from "./entry.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'let digest=0;',
    'const cpuStart=process.cpuUsage();',
    'const start=performance.now();',
    'for(let i=0;i<'+iterations+';i++){digest=(digest+unrelated())|0;}',
    'const workMs=performance.now()-start;',
    'const cpu=process.cpuUsage(cpuStart);',
    'const workCpuMs=(cpu.user+cpu.system)/1000;',
    'console.log(JSON.stringify({digest,source:answer.source,workMs,workCpuMs}));'
  ].join('\n');
}

/** @param {string} root @param {SourceFile[]} files @returns {Promise<void>} */
async function writeGraph(root,files){
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
}

/**
 * @param {string} root
 * @returns {Sample}
 */
function sample(root){
  const start=performance.now();
  const child=spawnSync(process.execPath,[path.join(root,'measure.mjs')],{
    encoding:'utf8',timeout:30000
  });
  const wallMs=performance.now()-start;
  assert.equal(child.status,0,child.stderr || child.error?.message);
  const result=JSON.parse(child.stdout.trim());
  assert.equal(typeof result.workMs,'number');
  assert.ok(Number.isFinite(result.workCpuMs) && result.workCpuMs>=0);
  assert.equal(typeof result.digest,'number');
  assert.equal(typeof result.source,'string');
  return {workMs:result.workMs,workCpuMs:result.workCpuMs,wallMs,
    digest:result.digest,source:result.source};
}

/**
 * Emit paired hot-loop process CPU, hot-loop elapsed time and cold-process
 * wall samples. Zero-tick CPU pairs are explicitly unscorable, not passes. The compiler runs
 * once out of band, as the normal COO/SNO pre-obfuscation build does. Cold
 * process startup is measured separately from in-app work, without claiming
 * that either sample set universally proves the 2.5x threshold.
 *
 * @param {number} iterations
 * @param {number} [pairs]
 * @returns {Promise<{iterations:number,originalBytes:number,emittedBytes:number,renamedProperties:number,
 *  pairs:number,medianNativeWorkMs:number,medianEmittedWorkMs:number,
 *  medianNativeWallMs:number,medianEmittedWallMs:number,medianWorkRatio:number,
 *  medianNativeCpuMs:number,medianEmittedCpuMs:number,medianCpuRatio:number|null,
 *  comparableCpuPairs:number,overBudgetCpuPairs:number,
 *  medianWallRatio:number,overBudgetWorkPairs:number,overBudgetWallPairs:number}>}
 */
async function profile(iterations,pairs=9) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-profile-'));
  try{
    const originals=application(iterations);
    const compiled=obfuscateFiles(originals,{
      mode:'coo',seed:'island-session-profile',closedWorld:true,
      strings:false,identifiers:false,experimentalSourceObserverIslands:['independent.mjs']
    });
    const changed=compiled.files.find(f=>f.path==='independent.mjs');
    assert.ok(changed && changed.metrics.properties>=1);
    const originalDir=path.join(root,'original');
    const emittedDir=path.join(root,'emitted');
    await writeGraph(originalDir,originals);
    await writeGraph(emittedDir,compiled.files);
    const adapter=measurementAdapter(iterations);
    await atomicWrite(path.join(originalDir,'measure.mjs'),adapter);
    await atomicWrite(path.join(emittedDir,'measure.mjs'),adapter);
    /** @type {Sample[]} */
    const before=[];
    /** @type {Sample[]} */
    const after=[];
    let overBudgetWorkPairs=0,overBudgetWallPairs=0;
    let comparableCpuPairs=0,overBudgetCpuPairs=0;
    for(let trial=0;trial<pairs;trial++) {
      /** @type {Sample} */
      let native,emitted;
      if(trial%2===0){
        native=sample(originalDir);
        emitted=sample(emittedDir);
      }else{
        emitted=sample(emittedDir);
        native=sample(originalDir);
      }
      assert.equal(native.digest,emitted.digest);
      assert.equal(native.source,emitted.source);
      assert.equal(native.source,'function watched(){return valueA;}');
      if(emitted.workMs>2.5*native.workMs)overBudgetWorkPairs++;
      if(emitted.wallMs>2.5*native.wallMs)overBudgetWallPairs++;
      if(native.workCpuMs>0 && emitted.workCpuMs>0) {
        comparableCpuPairs++;
        if(emitted.workCpuMs>2.5*native.workCpuMs)overBudgetCpuPairs++;
      }
      before.push(native);
      after.push(emitted);
    }
    const origWork=median(before.map(x=>x.workMs));
    const emitWork=median(after.map(x=>x.workMs));
    const origCpu=median(before.map(x=>x.workCpuMs));
    const emitCpu=median(after.map(x=>x.workCpuMs));
    const origWall=median(before.map(x=>x.wallMs));
    const emitWall=median(after.map(x=>x.wallMs));
    return {
      iterations,
      originalBytes:originals.reduce((n,f)=>n+String(f.code).length,0),
      emittedBytes:compiled.files.reduce((n,f)=>n+String(f.code).length,0),
      renamedProperties:changed.metrics.properties,
      pairs,
      medianNativeWorkMs:origWork,medianEmittedWorkMs:emitWork,
      medianNativeWallMs:origWall,medianEmittedWallMs:emitWall,
      medianNativeCpuMs:origCpu,medianEmittedCpuMs:emitCpu,
      medianCpuRatio:origCpu>0 && emitCpu>0 ? emitCpu/origCpu : null,
      comparableCpuPairs,overBudgetCpuPairs,
      medianWorkRatio:emitWork/origWork,
      medianWallRatio:emitWall/origWall,
      overBudgetWorkPairs,overBudgetWallPairs
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

async function main(){
  for(const iterations of [10000,100000,1000000,10000000]){
    console.log('SOURCE_ISLAND_PROFILE '+JSON.stringify(await profile(iterations)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={profile};
