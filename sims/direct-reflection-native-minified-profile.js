'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const esbuild = require('esbuild');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');
const {normalizePublicFields} = require('./public-token-normalizer');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{user:number,system:number}} CpuSample */
/** @typedef {{cpuUs:number,wallMs:number,value:number}} TimedResult */

/** @returns {Input[]} */
function sources() {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={hotScore:7,hotWeight:13};'},
    {path:'worker.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'function privateRun(initial,iterations){',
      'let total=initial|0;',
      'for(let i=0;i<iterations;i++){',
      'if(Reflect.has(state,"hotScore")&&Object.hasOwn(state,"hotWeight")){',
      'const descriptor=Reflect.getOwnPropertyDescriptor(state,"hotScore");',
      'Reflect.set(state,"hotScore",7);',
      'total=((total+descriptor.value)^Reflect.get(state,"hotWeight"))|0;',
      '}',
      '}return total;}',
      'export function run(initial,iterations){return privateRun(initial,iterations);}'
    ].join('')}
  ];
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=sorted.length>>1;
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}

/** @param {string} dir @param {{path:string,code:string}[]} files */
async function writeSet(dir,files) {
  for(const file of files) {
    await fs.mkdir(path.dirname(path.join(dir,file.path)),{recursive:true});
    await atomicWrite(path.join(dir,file.path),file.code);
  }
}

/** @param {(initial:number,iterations:number)=>number} fn @param {number} input @param {number} iterations @returns {TimedResult} */
function measure(fn,input,iterations) {
  const started=process.cpuUsage();
  const wallStart=performance.now();
  const value=fn(input,iterations);
  const wallMs=performance.now()-wallStart;
  const elapsed=process.cpuUsage(started);
  return {cpuUs:elapsed.user+elapsed.system,wallMs,value};
}

/**
 * Compare genuinely emitted closed-world ESM with original and ordinary
 * esbuild-minified ESM on the same private two-field hot workload.
 * @param {number} [iterations]
 * @param {number} [trials]
 */
async function run(iterations=1_000_000,trials=9) {
  if(!Number.isSafeInteger(iterations)||iterations<100_000||iterations>4_000_000)
    throw new RangeError('iterations out of supported range');
  if(!Number.isSafeInteger(trials)||trials<3||trials>21)
    throw new RangeError('trials out of supported range');

  const native=sources();
  const compiled=obfuscateFiles(native,{
    mode:'coo',closedWorld:true,seed:'reflection-paired-native',
    identifiers:false,strings:false
  });
  assert.equal(compiled.crossFile.properties,2,
    'benchmark requires two actual private property rewrites');
  const minified=await Promise.all(native.map(async file=>({
    ...file,
    code:(await esbuild.transform(file.code,{
      loader:'js',format:'esm',target:'es2022',minify:true
    })).code
  })));
  // The attack is seedless and reads only the actual public compiler output.
  // Minifying that normalized output measures whether the emitted private
  // labels impose an irreducible execution cost or static naming barrier.
  const normalized=normalizePublicFields(compiled.files.map(file=>({
    path:file.path,sourceType:file.sourceType,code:String(file.code)
  })),{preserveFreeMemberReceivers:false});
  assert.equal(normalized.properties,2,'source-only attacker must normalize both generated keys');
  const normalizedMinified=await Promise.all(normalized.files.map(async file=>({
    ...file,
    code:(await esbuild.transform(file.code,{
      loader:'js',format:'esm',target:'es2022',minify:true
    })).code
  })));
  /** @type {{name:'native'|'protected'|'minified'|'normalizedMinified',files:{path:string,code:string}[]}[]} */
  const variants=[
    {name:'native',files:native},
    {name:'protected',files:compiled.files.map(file=>({path:file.path,code:String(file.code)}))},
    {name:'minified',files:minified},
    {name:'normalizedMinified',files:normalizedMinified}
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-direct-reflection-'));
  try {
    /** @type {Record<string,(initial:number,iterations:number)=>number>} */
    const runners={};
    /** @type {Record<string,number>} */
    const firstLoadWallMs={};
    for(const variant of variants) {
      const dir=path.join(root,variant.name);
      await writeSet(dir,variant.files);
      const started=performance.now();
      const loaded=await import(pathToFileURL(path.join(dir,'worker.mjs')).href);
      firstLoadWallMs[variant.name]=performance.now()-started;
      runners[variant.name]=loaded.run;
      assert.equal(typeof loaded.run,'function');
    }
    assert.equal(runners.protected.toString(),runners.native.toString(),
      'public ESM wrapper function source must remain unchanged');
    for(const input of [-101,-1,0,3,127,0x7fffffff]) {
      const baseline=runners.native(input,2500);
      assert.equal(runners.protected(input,2500),baseline);
      assert.equal(runners.minified(input,2500),baseline);
      assert.equal(runners.normalizedMinified(input,2500),baseline);
    }
    for(let warm=0;warm<3;warm++){
      for(const variant of variants) runners[variant.name](warm,30000);
    }
    /** @type {{trial:number,native:TimedResult,protected:TimedResult,minified:TimedResult,normalizedMinified:TimedResult,protectedCpuRatio:number,minifiedCpuRatio:number,normalizedMinifiedCpuRatio:number}[]} */
    const rows=[];
    for(let trial=0;trial<trials;trial++) {
      /** @type {Record<string,TimedResult>} */
      const readings={};
      const order=trial%4===0?
        ['protected','native','normalizedMinified','minified']:
        trial%4===1?
        ['normalizedMinified','minified','native','protected']:
        trial%4===2?
        ['native','protected','minified','normalizedMinified']:
        ['minified','normalizedMinified','protected','native'];
      for(const variant of order) readings[variant]=measure(runners[variant],trial,iterations);
      assert.equal(readings.protected.value,readings.native.value);
      assert.equal(readings.minified.value,readings.native.value);
      assert.equal(readings.normalizedMinified.value,readings.native.value);
      assert.ok(readings.native.cpuUs>0,'a source CPU measurement must be nonzero');
      rows.push({
        trial,native:readings.native,protected:readings.protected,
        minified:readings.minified,normalizedMinified:readings.normalizedMinified,
        protectedCpuRatio:readings.protected.cpuUs/readings.native.cpuUs,
        minifiedCpuRatio:readings.minified.cpuUs/readings.native.cpuUs,
        normalizedMinifiedCpuRatio:readings.normalizedMinified.cpuUs/readings.native.cpuUs
      });
    }
    return {
      mode:'COO',sourceFields:2,rewrittenFields:compiled.crossFile.properties,
      normalizedFields:normalized.properties,
      iterations,trials,firstLoadWallMs,
      nativeSourceBytes:native.reduce((n,f)=>n+Buffer.byteLength(f.code),0),
      protectedSourceBytes:compiled.files.reduce((n,f)=>n+Buffer.byteLength(f.code),0),
      minifiedSourceBytes:minified.reduce((n,f)=>n+Buffer.byteLength(f.code),0),
      normalizedMinifiedSourceBytes:normalizedMinified.reduce((n,f)=>n+Buffer.byteLength(f.code),0),
      protectedMedianCpuRatio:median(rows.map(row=>row.protectedCpuRatio)),
      minifiedMedianCpuRatio:median(rows.map(row=>row.minifiedCpuRatio)),
      normalizedMinifiedMedianCpuRatio:median(rows.map(row=>row.normalizedMinifiedCpuRatio)),
      protectedStrictOver25:rows.filter(row=>row.protectedCpuRatio>2.5).length,
      minifiedStrictOver25:rows.filter(row=>row.minifiedCpuRatio>2.5).length,
      normalizedMinifiedStrictOver25:rows.filter(row=>row.normalizedMinifiedCpuRatio>2.5).length,
      rows
    };
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  run().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={sources,run};
