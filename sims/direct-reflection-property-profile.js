'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

const ITERATIONS=5000000;
const SAMPLES=11;

/**
 * @param {ModuleFile[]} files
 * @param {string} folder
 * @returns {Promise<void>}
 */
async function materialize(files,folder) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
}

/**
 * @param {string} folder
 * @returns {{ms:number,output:string}}
 */
function run(folder) {
  const begin=performance.now();
  const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
    encoding:'utf8',timeout:30000
  });
  const elapsed=performance.now()-begin;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return {ms:elapsed,output:child.stdout};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2===0 ?
    (sorted[middle-1]+sorted[middle])/2 : sorted[middle];
}

/**
 * @returns {Promise<{
 *   iterations:number,samples:number,nativeMs:number,emittedMs:number,
 *   ratio:number,within2point5:boolean,privateFieldsRenamed:number,
 *   allOutputsEqual:boolean
 * }>}
 */
async function main() {
  /** @type {ModuleFile[]} */
  const source=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretValue:29,otherValue:12};'},
    {path:'entry.mjs',sourceType:'module',
      code:`import {state} from './state.mjs';
let sum=0;
for(let i=0;i<${ITERATIONS};i++){
  sum+=Reflect.get(state,'secretValue');
  if(Object.hasOwn(state,'otherValue'))sum+=state.otherValue;
}
console.log(sum);
`}
  ];
  const transformed=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,seed:'direct-reflection-profile',
    identifiers:false,properties:true,strings:false
  });
  assert.equal(transformed.crossFile.properties,2,
    'Benchmark must exercise two genuinely renamed private fields');

  const nativeDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-native-'));
  const emittedDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-emitted-'));
  try {
    await materialize(source,nativeDir);
    await materialize(/** @type {ModuleFile[]} */(transformed.files),emittedDir);
    const expected=String(ITERATIONS*41)+'\n';

    for(let warmup=0;warmup<2;warmup++) {
      assert.equal(run(nativeDir).output,expected);
      assert.equal(run(emittedDir).output,expected);
    }

    /** @type {number[]} */
    const native=[];
    /** @type {number[]} */
    const emitted=[];
    for(let sample=0;sample<SAMPLES;sample++) {
      const order=sample%2===0 ?
        [['native',nativeDir],['emitted',emittedDir]] :
        [['emitted',emittedDir],['native',nativeDir]];
      for(const [kind,folder] of order) {
        const value=run(folder);
        assert.equal(value.output,expected,kind+' output mismatch');
        if(kind==='native')native.push(value.ms);
        else emitted.push(value.ms);
      }
    }
    const nativeMs=median(native);
    const emittedMs=median(emitted);
    const ratio=emittedMs/nativeMs;
    const result={
      iterations:ITERATIONS,samples:SAMPLES,nativeMs,emittedMs,ratio,
      within2point5:Number.isFinite(ratio)&&ratio<=2.5,
      privateFieldsRenamed:transformed.crossFile.properties,
      allOutputsEqual:true
    };
    process.stdout.write('DIRECT_REFLECTION_PROPERTY_PROFILE '+JSON.stringify({
      node:process.version,platform:process.platform,...result
    })+'\n');
    assert.ok(result.within2point5,
      'Direct-reflection transformed workload exceeded the 2.5x repeated-work budget');
    return result;
  }finally{
    await Promise.all([nativeDir,emittedDir].map(dir=>
      fs.rm(dir,{recursive:true,force:true})));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
