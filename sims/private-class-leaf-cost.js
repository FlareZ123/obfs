'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('./offline-normalize');

/**
 * The class's one method is source-private under the bounded class-leaf
 * proof. The hot workload returns a numeric result, and measured process CPU
 * excludes child-process launch. Whole-session wall time includes launch.
 */
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
 *   withinHotBudget:boolean|null,withinWholeBudget:boolean,
 *   sum:number,attackerCloneEqual:boolean
 * }} CostRow
 */

/**
 * @returns {Promise<{rows:CostRow[],properties:number}>}
 */
async function main(){
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'private-class-leaf-cost-20261123',
    properties:true,strings:false,identifiers:false}).files[0];
  assert.equal(transformed.metrics.properties,2,'Class leaf must rewrite two private keys');
  const attacked=neutralizeHashedNames([{
    path:'entry.cjs',sourceType:'commonjs',code:/** @type {string} */(transformed.code)
  }]);
  assert.equal(attacked.properties,2,'Public-only attacker can normalize both key labels');
  const folders=await Promise.all(['native','emitted','clone'].map(()=>
    fs.mkdtemp(path.join(os.tmpdir(),'obfs-leaf-cost-'))));
  const [native,emitted,clone]=folders;
  /** @type {CostRow[]} */
  const rows=[];
  try{
    await Promise.all([
      atomicWrite(path.join(native,'entry.cjs'),original),
      atomicWrite(path.join(emitted,'entry.cjs'),transformed.code),
      atomicWrite(path.join(clone,'entry.cjs'),attacked.files[0].code),
      ...folders.map(folder=>atomicWrite(path.join(folder,'runner.cjs'),runner))
    ]);
    for(const rounds of [1,100000,200000000]){
      const baseline=run(native,rounds);
      // Warm both separate processes before collecting alternating pairs.
      run(native,rounds);
      run(emitted,rounds);
      const nativeWall=[],emittedWall=[],nativeCpu=[],emittedCpu=[];
      for(let sample=0;sample<7;sample++){
        const order=sample%2===0?['native','emitted']:['emitted','native'];
        for(const variant of order){
          const result=run(variant==='native'?native:emitted,rounds);
          assert.equal(result.sum,baseline.sum,'Execution must preserve numeric output');
          (variant==='native'?nativeWall:emittedWall).push(result.wallMs);
          (variant==='native'?nativeCpu:emittedCpu).push(result.cpuUs);
        }
      }
      const attackedRun=run(clone,rounds);
      assert.equal(attackedRun.sum,baseline.sum,'Static attacker still has exact functional clone');
      const nativeWallMs=median(nativeWall);
      const emittedWallMs=median(emittedWall);
      const nativeCpuUs=median(nativeCpu);
      const emittedCpuUs=median(emittedCpu);
      const wallRatio=emittedWallMs/nativeWallMs;
      // Windows reports process CPU in coarse ticks; sub-32ms pairs cannot
      // establish a defensible hot-work ratio.
      const cpuRatio=nativeCpuUs>=32000&&emittedCpuUs>=32000 ?
        emittedCpuUs/nativeCpuUs : null;
      assert.ok(Number.isFinite(wallRatio)&&wallRatio>0);
      rows.push({rounds,samples:7,nativeWallMs,emittedWallMs,
        wallRatio,nativeCpuUs,emittedCpuUs,cpuRatio,
        withinHotBudget:cpuRatio===null?null:cpuRatio<=2.5,
        withinWholeBudget:wallRatio<=2.5,
        sum:baseline.sum,attackerCloneEqual:true});
    }
  } finally {
    await Promise.all(folders.map(folder=>fs.rm(folder,{recursive:true,force:true})));
  }
  process.stdout.write('PRIVATE_CLASS_LEAF_COST '+JSON.stringify({
    node:process.version,platform:process.platform,properties:transformed.metrics.properties,rows,
    scope:'Paired seven-sample fresh Node CJS process measurements; local owner plus one class leaf. No cross-file host instrumentation.'
  })+'\n');
  assert.ok(rows.every(row=>row.withinWholeBudget));
  assert.ok(rows.filter(row=>row.rounds===200000000).every(row=>row.withinHotBudget===true),
    'Sustained CPU was unmeasurable or exceeded strict 2.5x');
  return {rows,properties:transformed.metrics.properties};
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
