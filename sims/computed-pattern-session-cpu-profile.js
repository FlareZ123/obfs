'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{checksum:number,totalCpuUs:number,hotCpuUs:number}} Measurement */

/** @param {number[]} values @returns {number} */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Source contract for a real closed-world exported owner and immutable key.
 * The late key location tests the acyclic proof introduced in this revision.
 * The executable main module reports total process CPU and hot-loop CPU,
 * independently of externally observed JS arithmetic behavior.
 *
 * @param {'direct'|'reexported'} variant
 * @returns {ModuleFile[]}
 */
function source(variant) {
  /** @type {ModuleFile[]} */
  const files=[{path:'state.mjs',sourceType:'module',
    code:'export const bag={secretField:41,bias:2};'+
      'export const key="secretField";'}];
  const imports=variant==='reexported'?
    'import {bag} from "./state.mjs";import {selected} from "./relay.mjs";':
    'import {bag,key} from "./state.mjs";';
  const selected=variant==='reexported'?'selected':'key';
  if(variant==='reexported')files.push({
    path:'relay.mjs',sourceType:'module',
    code:'export {key as selected} from "./state.mjs";'
  });
  const program=imports+
    'const count=Number(process.argv[2]);'+
    'const start=process.cpuUsage();'+
    'let checksum=0;'+
    'for(let index=0;index<count;index++){'+
      `const {[${selected}]:value}=bag;`+
      'checksum=(checksum+value+index)>>>0;'+
    '}'+
    'const after=process.cpuUsage();'+
    'const hotCpuUs=after.user+after.system-start.user-start.system;'+
    'const total=process.cpuUsage();'+
    'console.log(JSON.stringify({checksum,hotCpuUs,'+
      'totalCpuUs:total.user+total.system}));';
  files.push({path:'main.mjs',sourceType:'module',code:program});
  return files;
}

/**
 * @param {string} directory
 * @param {ModuleFile[]} files
 */
async function materialize(directory,files){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
}

/**
 * @param {string} directory
 * @param {number} iterations
 * @returns {Measurement}
 */
function run(directory,iterations){
  const child=spawnSync(process.execPath,[
    path.join(directory,'main.mjs'),String(iterations)
  ],{encoding:'utf8',timeout:30000});
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  /** @type {Measurement} */
  const measurement=JSON.parse(child.stdout);
  assert.ok(Number.isInteger(measurement.checksum));
  assert.ok(Number.isFinite(measurement.totalCpuUs)&&measurement.totalCpuUs>0);
  assert.ok(Number.isFinite(measurement.hotCpuUs)&&measurement.hotCpuUs>=0);
  return measurement;
}

/** @returns {Promise<void>} */
async function main(){
  const rows=[];
  for(const variant of /** @type {const} */ (['direct','reexported'])){
    const files=source(variant);
    const transformed=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'computed-session-cpu-20261122/'+variant
    });
    assert.equal(transformed.crossFile.properties,2,
      'Profile requires two actually rewritten private fields');
    const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-cpu-'));
    const nativeDir=path.join(parent,'native');
    const deliveredDir=path.join(parent,'emitted');
    try{
      await materialize(nativeDir,files);
      await materialize(deliveredDir,/** @type {ModuleFile[]} */ (transformed.files));
      for(const iterations of [1,100000,1000000]){
        const native=[];
        const emitted=[];
        let checksum;
        for(let pair=0;pair<9;pair++){
          const order=pair%2===0?
            [['native',nativeDir],['emitted',deliveredDir]]:
            [['emitted',deliveredDir],['native',nativeDir]];
          for(const [kind,directory] of order){
            const output=run(directory,iterations);
            checksum??=output.checksum;
            assert.equal(output.checksum,checksum,
              variant+'/'+iterations+'/'+kind+'/'+pair);
            if(kind==='native')native.push(output);
            else emitted.push(output);
          }
        }
        const nativeCpuUs=median(native.map(s=>s.totalCpuUs));
        const emittedCpuUs=median(emitted.map(s=>s.totalCpuUs));
        const ratio=emittedCpuUs/nativeCpuUs;
        const nativeHotCpuUs=median(native.map(s=>s.hotCpuUs));
        const emittedHotCpuUs=median(emitted.map(s=>s.hotCpuUs));
        rows.push({
          variant,iterations,checksum,pairs:9,
          propertiesRenamed:transformed.crossFile.properties,
          totalCpu:{nativeMedianUs:nativeCpuUs,emittedMedianUs:emittedCpuUs,
            emittedOverNativeRatio:ratio,
            strictPairsAbove2point5:emitted.filter((sample,index)=>
              sample.totalCpuUs/native[index].totalCpuUs>2.5).length},
          hotCpu:{nativeMedianUs:nativeHotCpuUs,emittedMedianUs:emittedHotCpuUs,
            emittedOverNativeRatio:nativeHotCpuUs>0?
              emittedHotCpuUs/nativeHotCpuUs:null,
            measurementGranularity:'process.cpuUsage microseconds; zero ticks possible'},
          raw:{native,emitted}
        });
      }
    }finally{
      await fs.rm(parent,{recursive:true,force:true});
    }
  }
  console.log('COMPUTED_PATTERN_SESSION_CPU_PROFILE '+JSON.stringify({
    node:process.version,platform:process.platform,
    scope:'paired fresh Node ESM process CPU plus hot-loop CPU, local disk only',
    rows
  }));
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
