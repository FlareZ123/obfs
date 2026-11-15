'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} SourceFile */
/** @typedef {'direct'|'readers'|'identity'} Style */
/** @typedef {{style:Style,properties:number,sourceBytes:number,emittedBytes:number,
 *    coldNativeMs:number,coldObfuscatedMs:number,nativeMedianMs:number,
 *    obfuscatedMedianMs:number,hotRatio:number,wholeRatio:number,matchingProbes:number}} Measurement */

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2===1?sorted[middle]:
    (sorted[middle-1]+sorted[middle])/2;
}

/**
 * Build one of three positive cross-module ESM property-flow workloads.
 * Both renames are observable through public hot() computations.
 * @param {Style} style
 * @returns {SourceFile[]}
 */
function generate(style) {
  const state=[
    'export const state={hotScore:7,hotWeight:13};',
    style==='readers'?'export function score(x){return x.hotScore;}'+
      'export function weight(x){return x.hotWeight;}':''
  ].join('');
  const imports=style==='readers'?
    'import {state,score,weight} from "./state.mjs";':
    'import {state} from "./state.mjs";';
  const alias=style==='identity'?
    'import {identity} from "./identity.mjs";const stable=identity(state);':'';
  const score=style==='readers'?'score(state)':
    (style==='identity'?'stable.hotScore':'state.hotScore');
  const weight=style==='readers'?'weight(state)':
    (style==='identity'?'stable.hotWeight':'state.hotWeight');
  const worker=[
    imports,alias,
    'export function hot(initial,iterations){',
    'let value=initial|0;',
    'for(let i=0;i<iterations;i++){',
    'value=((value+',score,')^',weight,')|0;',
    '}',
    'return value;',
    '}'
  ].join('');
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',code:state,sourceType:'module'},
    {path:'worker.mjs',code:worker,sourceType:'module'}
  ];
  if(style==='identity')files.push({
    path:'identity.mjs',code:'export const identity=value=>value;',sourceType:'module'
  });
  return files;
}

/** @param {string} folder @param {{path:string,code:string|Buffer}[]} files */
async function writeFiles(folder,files) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
}

/**
 * Run a real Node ESM hot workload after native and obfuscated module
 * initialization, without mixing compile time into the observed runtime.
 * @param {Style} style
 * @param {number} iterations
 * @param {number} trials
 * @returns {Promise<Measurement>}
 */
async function measure(style,iterations,trials) {
  const files=generate(style);
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,
    seed:'property-hotpath/'+style
  });
  assert.equal(result.crossFile.properties,2,style+' must protect two properties');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-property-hot-'));
  try {
    const before=path.join(root,'native');
    const after=path.join(root,'obfuscated');
    await writeFiles(before,files);
    await writeFiles(after,result.files);
    const nativeStart=performance.now();
    const native=await import(pathToFileURL(path.join(before,'worker.mjs')).href);
    const coldNativeMs=performance.now()-nativeStart;
    const protectedStart=performance.now();
    const protectedModule=await import(pathToFileURL(path.join(after,'worker.mjs')).href);
    const coldObfuscatedMs=performance.now()-protectedStart;
    /** @type {(initial:number,iterations:number)=>number} */
    const originalHot=native.hot;
    /** @type {(initial:number,iterations:number)=>number} */
    const obfuscatedHot=protectedModule.hot;
    let matchingProbes=0;
    for(const seed of [0,1,7,43,511,-91]) {
      assert.equal(obfuscatedHot(seed,10000),originalHot(seed,10000));
      matchingProbes++;
    }
    for(let i=0;i<5;i++) {
      assert.equal(obfuscatedHot(i,iterations),originalHot(i,iterations));
    }
    /** @type {number[]} */
    const nativeDurations=[];
    /** @type {number[]} */
    const obfuscatedDurations=[];
    /** @param {(initial:number,iterations:number)=>number} fn @param {number} n @returns {number} */
    function time(fn,n) {
      const start=performance.now();
      fn(n,iterations);
      return performance.now()-start;
    }
    // Alternating order reduces persistent JIT/drift bias; the array contains
    // genuine per-function elapsed samples, never fake subtracted "work".
    for(let i=0;i<trials;i++) {
      if(i%2===0) {
        obfuscatedDurations.push(time(obfuscatedHot,i));
        nativeDurations.push(time(originalHot,i));
      }else {
        nativeDurations.push(time(originalHot,i));
        obfuscatedDurations.push(time(obfuscatedHot,i));
      }
    }
    const nativeMedianMs=median(nativeDurations);
    const obfuscatedMedianMs=median(obfuscatedDurations);
    return {
      style,properties:result.crossFile.properties,
      sourceBytes:files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
      emittedBytes:result.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
      coldNativeMs:Number(coldNativeMs.toFixed(3)),
      coldObfuscatedMs:Number(coldObfuscatedMs.toFixed(3)),
      nativeMedianMs:Number(nativeMedianMs.toFixed(3)),
      obfuscatedMedianMs:Number(obfuscatedMedianMs.toFixed(3)),
      hotRatio:Number((obfuscatedMedianMs/nativeMedianMs).toFixed(4)),
      wholeRatio:Number(((coldObfuscatedMs+obfuscatedMedianMs)/
        (coldNativeMs+nativeMedianMs)).toFixed(4)),
      matchingProbes
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {number} [iterations]
 * @param {number} [trials]
 * @returns {Promise<{iterations:number,trials:number,measurements:Measurement[]}>}
 */
async function runHotpath(iterations=7_000_000,trials=9) {
  if(!Number.isSafeInteger(iterations)||iterations<1000||iterations>30_000_000)
    throw new RangeError('iterations out of 1000..30000000');
  if(!Number.isSafeInteger(trials)||trials<3||trials>25)
    throw new RangeError('trials out of 3..25');
  /** @type {Measurement[]} */
  const measurements=[];
  for(const style of /** @type {Style[]} */ (['direct','readers','identity'])) {
    measurements.push(await measure(style,iterations,trials));
  }
  return {iterations,trials,measurements};
}

if(require.main===module) {
  runHotpath().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runHotpath,generate,measure};
