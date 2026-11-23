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
/** @typedef {'direct'|'readers'|'identity'|'wrapped'} Style */
/** @typedef {'literal'|'pure-expression'} ValueKind */
/** @typedef {{style:Style,valueKind:ValueKind,properties:number,sourceBytes:number,emittedBytes:number,
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
 * Build a private-owner ESM workload with three independent positive
 * dataflow grammars: direct member reads, a private two-reader relay, and
 * forwarded identity. Their private field reads are exclusively inside
 * nonexported direct-call-only functions. The public hot() wrapper retains
 * exactly the same externally observable Function#toString source.
 * @param {Style} style
 * @param {ValueKind} [valueKind]
 * @returns {SourceFile[]}
 */
function generate(style,valueKind='literal') {
  const state=[
    valueKind==='pure-expression'?
      'export const state={hotScore:(21-14),hotWeight:(5<<2)-7};':
      'export const state={hotScore:7,hotWeight:13};'
  ].join('');
  const imports='import {state} from "./state.mjs";';
  const alias=style==='identity'?
    'import {identity} from "./identity.mjs";const stable=identity(state);':
    style==='readers'?
      'function score(){return state.hotScore;}function weight(){return state.hotWeight;}':'';
  const score=style==='readers'?'score()':
    (style==='identity'?'stable.hotScore':'state.hotScore');
  const weight=style==='readers'?'weight()':
    (style==='identity'?'stable.hotWeight':'state.hotWeight');
  const worker=[
    imports,alias,
    style==='direct' ? 'export function hot(initial,iterations){' :
      'function privateHot(initial,iterations){',
    'let value=initial|0;',
    'for(let i=0;i<iterations;i++){',
    'value=((value+',score,')^',weight,')|0;',
    '}',
    'return value;',
    '}',
    style==='direct' ? '' :
      'export function hot(initial,iterations){return privateHot(initial,iterations);}'
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
 * @param {ValueKind} [valueKind]
 * @returns {Promise<Measurement>}
 */
async function measure(style,iterations,trials,valueKind='literal') {
  const files=generate(style,valueKind);
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,
    seed:'property-hotpath/'+style
  });
  const counts=result.files.map(file=>({
    path:file.path,objects:file.metrics.objects,properties:file.metrics.properties
  }));
  assert.equal(result.crossFile.properties,2,
    style+'/'+valueKind+' must protect two properties; per-file metrics: '+
    JSON.stringify(counts));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-property-hot-'));
  try {
    // Each cold import has a fresh module URL. Alternating first-import
    // ordering across several pairs limits the warm filesystem/module-loader
    // bias that would favor the second file in a single comparison.
    /** @type {number[]} */
    const coldNativeSamples=[];
    /** @type {number[]} */
    const coldObfuscatedSamples=[];
    /** @type {{native:((initial:number,iterations:number)=>number)|null,protected:((initial:number,iterations:number)=>number)|null}} */
    const loadedFunctions={native:null,protected:null};
    for(let repeat=0;repeat<trials;repeat++) {
      const before=path.join(root,'native-'+repeat);
      const after=path.join(root,'obfuscated-'+repeat);
      await writeFiles(before,files);
      await writeFiles(after,result.files);
      /** @returns {Promise<void>} */
      async function loadNative() {
        const started=performance.now();
        const loaded=await import(pathToFileURL(path.join(before,'worker.mjs')).href);
        coldNativeSamples.push(performance.now()-started);
        if(loadedFunctions.native===null)loadedFunctions.native=loaded.hot;
      }
      /** @returns {Promise<void>} */
      async function loadProtected() {
        const started=performance.now();
        const loaded=await import(pathToFileURL(path.join(after,'worker.mjs')).href);
        coldObfuscatedSamples.push(performance.now()-started);
        if(loadedFunctions.protected===null)loadedFunctions.protected=loaded.hot;
      }
      if(repeat%2===0){await loadNative();await loadProtected();}
      else {await loadProtected();await loadNative();}
    }
    assert.ok(loadedFunctions.native&&loadedFunctions.protected);
    const originalHot=loadedFunctions.native;
    const obfuscatedHot=loadedFunctions.protected;
    if(style!=='direct'){
      assert.equal(obfuscatedHot.toString(),originalHot.toString(),
        style+' benchmark must preserve public native Function#toString');
    }
    const coldNativeMs=median(coldNativeSamples);
    const coldObfuscatedMs=median(coldObfuscatedSamples);
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
      style,valueKind,properties:result.crossFile.properties,
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
 * @param {ValueKind} [valueKind]
 * @returns {Promise<{iterations:number,trials:number,valueKind:ValueKind,measurements:Measurement[]}>}
 */
async function runHotpath(iterations=7_000_000,trials=9,valueKind='literal') {
  if(!Number.isSafeInteger(iterations)||iterations<1000||iterations>30_000_000)
    throw new RangeError('iterations out of 1000..30000000');
  if(!Number.isSafeInteger(trials)||trials<3||trials>25)
    throw new RangeError('trials out of 3..25');
  /** @type {Measurement[]} */
  const measurements=[];
  for(const style of /** @type {Style[]} */ (['wrapped','readers','identity'])) {
    measurements.push(await measure(style,iterations,trials,valueKind));
  }
  return {iterations,trials,valueKind,measurements};
}

if(require.main===module) {
  const valueKind=process.argv.includes('--pure-expressions')?'pure-expression':'literal';
  runHotpath(7_000_000,9,valueKind).then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runHotpath,generate,measure};
