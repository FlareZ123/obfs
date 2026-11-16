'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{result:number,hotMs:number,processMs:number}} Measure */
/** @typedef {{iterations:number,nativeProcessMs:number,emittedProcessMs:number,processRatio:number,nativeHotMs:number,emittedHotMs:number,hotRatio:number,within2point5:boolean}} SessionRow */

/**
 * A closed private owner with two statically proved readers and an explicit
 * numeric-only host API. External callback invocation is part of both runs.
 * Every variant receives exactly the same original public API and arguments.
 * @returns {ModuleFile[]}
 */
function original() {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={privateField:41,auxiliaryField:59};'},
    {path:'host.mjs',sourceType:'module',
      code:'globalThis.window={api:{numeric(x){return (Math.imul(x,7)^151)&255;}}};'},
    {path:'bridge.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";import "./host.mjs";'+
        'export function read(x){return (Math.imul(state.privateField+x,17)^'+
        '(state.auxiliaryField-(x>>>1)))+globalThis.window.api.numeric(x);}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {performance} from "node:perf_hooks";'+
        'import {read} from "./bridge.mjs";'+
        'const iterations=Number(process.argv[2]);'+
        'let accumulator=0;const start=performance.now();'+
        'for(let k=0;k<iterations;k++)accumulator=(accumulator+read(k))|0;'+
        'const elapsed=performance.now()-start;'+
        'process.stdout.write(JSON.stringify({result:accumulator,hotMs:elapsed}));'}
  ];
}

/** @param {string} folder @param {ModuleFile[]} files @returns {Promise<void>} */
async function materialize(folder,files) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
}

/** @param {string} folder @param {number} iterations @returns {Measure} */
function execute(folder,iterations) {
  const start=performance.now();
  const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs'),String(iterations)],{
    encoding:'utf8',timeout:30000
  });
  const processMs=performance.now()-start;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  const value=/** @type {{result:number,hotMs:number}} */ (JSON.parse(child.stdout));
  assert.ok(Number.isFinite(value.hotMs) && value.hotMs>=0);
  assert.ok(Number.isInteger(value.result));
  return {...value,processMs};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Actual native Node ESM loading, host calls and direct private field reads.
 * Process ratios include cold startup; hot ratios measure in-child repeated
 * application work. No startup exemption is applied to any mode.
 *
 * @param {number} [samples]
 * @returns {Promise<{node:string,platform:string,renamedFields:number,sourceBytes:number,emittedBytes:number,samples:number,rows:SessionRow[],allOutputsEqual:true}>}
 */
async function runProfile(samples=7) {
  assert.ok(Number.isInteger(samples)&&samples>=3&&samples<=20);
  const native=original();
  const transform=obfuscateFiles(native,{
    mode:'coo',closedWorld:true,identifiers:false,strings:false,
    seed:'esm-observation-session-20261116'
  });
  assert.equal(transform.crossFile.properties,2,
    'The performance test must exercise two actually transformed private fields');
  const emitted=/** @type {ModuleFile[]} */ (transform.files);
  const sourceBytes=native.reduce((n,file)=>n+Buffer.byteLength(file.code),0);
  const emittedBytes=emitted.reduce((n,file)=>n+Buffer.byteLength(file.code),0);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-observation-session-'));
  /** @type {SessionRow[]} */
  const rows=[];
  try {
    const nativeDir=path.join(root,'native');
    const emittedDir=path.join(root,'emitted');
    await materialize(nativeDir,native);
    await materialize(emittedDir,emitted);
    for(const iterations of [1,2000000]) {
      /** @type {Measure[]} */
      const nativeRuns=[];
      /** @type {Measure[]} */
      const emittedRuns=[];
      const baseline=execute(nativeDir,iterations).result;
      for(let trial=0;trial<samples;trial++) {
        const order=trial%2===0?
          [['native',nativeDir],['emitted',emittedDir]]:
          [['emitted',emittedDir],['native',nativeDir]];
        for(const [kind,folder] of order) {
          const measured=execute(folder,iterations);
          assert.equal(measured.result,baseline,
            'The full ESM native/public stateful numeric output must be exact');
          (kind==='native'?nativeRuns:emittedRuns).push(measured);
        }
      }
      const nativeProcessMs=median(nativeRuns.map(x=>x.processMs));
      const emittedProcessMs=median(emittedRuns.map(x=>x.processMs));
      const nativeHotMs=median(nativeRuns.map(x=>x.hotMs));
      const emittedHotMs=median(emittedRuns.map(x=>x.hotMs));
      const processRatio=emittedProcessMs/nativeProcessMs;
      const hotRatio=emittedHotMs/nativeHotMs;
      rows.push({iterations,nativeProcessMs,emittedProcessMs,processRatio,
        nativeHotMs,emittedHotMs,hotRatio,within2point5:processRatio<=2.5});
    }
    const report={node:process.version,platform:process.platform,
      renamedFields:transform.crossFile.properties,sourceBytes,emittedBytes,
      samples,rows,allOutputsEqual:/** @type {const} */(true)};
    assert.ok(rows.every(row=>Number.isFinite(row.hotRatio)&&row.hotRatio>0));
    return report;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runProfile().then(report=>process.stdout.write(
    'ESM_OBSERVATION_SESSION '+JSON.stringify(report)+'\n'
  )).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={runProfile};
