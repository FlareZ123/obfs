'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

const original=[
  "'use strict';",
  'const owner={secretAlpha:17,secretBeta:3};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const reader=new Reader();',
  'const another=new Reader();',
  'const rounds=Number(process.env.OBFS_ROUNDS);',
  'const start=process.cpuUsage();',
  'let sum=0;',
  'for(let index=0;index<rounds;index++)sum+=(reader.read()^(index&15))+(another.read()^(index&7))+owner.secretBeta;',
  'const duration=process.cpuUsage(start);',
  'module.exports={sum,cpuUs:duration.user+duration.system};'
].join('\n');

const runner=[
  "'use strict';",
  "const result=require('./entry.cjs');",
  'process.stdout.write(JSON.stringify(result));'
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * @param {string} folder
 * @param {number} rounds
 * @returns {{wallMs:number,sum:number,cpuUs:number}}
 */
function run(folder,rounds){
  const start=performance.now();
  const child=spawnSync(process.execPath,[path.join(folder,'runner.cjs')],{
    cwd:folder,encoding:'utf8',timeout:30000,
    env:{...process.env,OBFS_ROUNDS:String(rounds)}
  });
  const wallMs=performance.now()-start;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  const parsed=/** @type {{sum:number,cpuUs:number}} */(JSON.parse(child.stdout));
  assert.ok(Number.isSafeInteger(parsed.sum));
  assert.ok(Number.isFinite(parsed.cpuUs)&&parsed.cpuUs>=0);
  return {wallMs,...parsed};
}

/**
 * @typedef {{
 *   rounds:number,samples:number,nativeWallMs:number,emittedWallMs:number,
 *   wallRatio:number,nativeCpuUs:number,emittedCpuUs:number,cpuRatio:number|null,
 *   withinHotBudget:boolean|null,withinWholeBudget:boolean,sum:number
 * }} CostRow
 */

/** @returns {Promise<{rows:CostRow[],properties:number}>} */
async function main(){
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'private-class-symbol-cost-20261123',
    properties:true,experimentalSymbolKeys:true,
    strings:false,identifiers:false}).files[0];
  assert.equal(transformed.metrics.properties,2);
  assert.equal(transformed.metrics.symbolKeys,2);
  const folders=await Promise.all(['native','emitted'].map(()=>
    fs.mkdtemp(path.join(os.tmpdir(),'obfs-class-symbol-'))));
  const [native,emitted]=folders;
  /** @type {CostRow[]} */
  const rows=[];
  try{
    await Promise.all([
      atomicWrite(path.join(native,'entry.cjs'),original),
      atomicWrite(path.join(emitted,'entry.cjs'),transformed.code),
      ...folders.map(folder=>atomicWrite(path.join(folder,'runner.cjs'),runner))
    ]);
    for(const rounds of [1,100000,200000000]){
      const baseline=run(native,rounds);
      run(native,rounds);
      run(emitted,rounds);
      const nativeWall=[],emittedWall=[],nativeCpu=[],emittedCpu=[];
      for(let sample=0;sample<7;sample++){
        for(const variant of sample%2===0?['native','emitted']:['emitted','native']){
          const output=run(variant==='native'?native:emitted,rounds);
          assert.equal(output.sum,baseline.sum,'Native/Symbol numeric outputs must match');
          (variant==='native'?nativeWall:emittedWall).push(output.wallMs);
          (variant==='native'?nativeCpu:emittedCpu).push(output.cpuUs);
        }
      }
      const nativeWallMs=median(nativeWall),emittedWallMs=median(emittedWall);
      const nativeCpuUs=median(nativeCpu),emittedCpuUs=median(emittedCpu);
      const wallRatio=emittedWallMs/nativeWallMs;
      const cpuRatio=nativeCpuUs>=32000&&emittedCpuUs>=32000?
        emittedCpuUs/nativeCpuUs:null;
      assert.ok(Number.isFinite(wallRatio)&&wallRatio>0);
      rows.push({rounds,samples:7,nativeWallMs,emittedWallMs,wallRatio,
        nativeCpuUs,emittedCpuUs,cpuRatio,
        withinHotBudget:cpuRatio===null?null:cpuRatio<=2.5,
        withinWholeBudget:wallRatio<=2.5,
        sum:baseline.sum});
    }
  }finally{
    await Promise.all(folders.map(folder=>fs.rm(folder,{recursive:true,force:true})));
  }
  process.stdout.write('PRIVATE_CLASS_SYMBOL_COST '+JSON.stringify({
    node:process.version,platform:process.platform,properties:transformed.metrics.properties,rows,
    scope:'Seven alternating native/Symbol-emitted fresh Node 22 CJS pairs; immutable local private class and two native Symbol keys. No hostile Symbol constructor.'
  })+'\n');
  assert.ok(rows.every(row=>row.withinWholeBudget));
  assert.ok(rows.filter(row=>row.rounds===200000000).every(row=>row.withinHotBudget===true));
  return {rows,properties:transformed.metrics.properties};
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
