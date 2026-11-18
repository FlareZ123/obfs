'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {original}=require('./straightline-reader-profile');

const runner=[
  "'use strict';",
  "const fn=require(process.argv[2]);",
  "const count=Number(process.argv[3]);",
  "let digest=0;",
  "for(let index=0;index<count;index++)digest=(digest+fn(index&1023))|0;",
  "const elapsed=process.cpuUsage();",
  "process.stdout.write(JSON.stringify({digest,cpuMs:(elapsed.user+elapsed.system)/1000}));"
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Execute an actual CJS module in a fresh Node process, including module load,
 * V8 initialization, and selected business work in the child CPU measurement.
 * @param {string} runnerPath
 * @param {string} entryPath
 * @param {number} count
 * @returns {{digest:number,cpuMs:number}}
 */
function sample(runnerPath,entryPath,count){
  const child=spawnSync(process.execPath,[runnerPath,entryPath,String(count)],{
    encoding:'utf8',timeout:30000
  });
  assert.equal(child.status,0,child.stderr||child.error?.message);
  const result=/** @type {{digest:number,cpuMs:number}} */(JSON.parse(child.stdout));
  assert.ok(Number.isFinite(result.cpuMs)&&result.cpuMs>=0);
  return result;
}

/** @returns {Promise<object>} */
async function run(){
  const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
    mode:'coo',seed:'straightline-reader-cpu-20261118',
    strings:false,identifiers:false
  }).files[0];
  assert.equal(compiled.metrics.properties,1);
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-straightline-cold-'));
  try{
    const nativePath=path.join(workspace,'native','entry.cjs');
    const protectedPath=path.join(workspace,'compiled','entry.cjs');
    const runnerPath=path.join(workspace,'runner.cjs');
    await atomicWrite(nativePath,original);
    await atomicWrite(protectedPath,compiled.code);
    await atomicWrite(runnerPath,runner);
    /** @type {Array<{calls:number,pairs:number,nativeCpuMs:number[],compiledCpuMs:number[],
     * pairedRatios:(number|null)[],ratioOfMedians:number|null,maxPairedRatio:number|null,
     * strictOverBudgetPairs:number,unresolvedZeroPairs:number}>} */
    const rows=[];
    // The 128M row amplifies protected work well beyond coarse Windows
    // process-CPU ticks; retain tiny cold rows as separate strict witnesses.
    for(const count of [1,10000,8000000,128000000]){
      /** @type {number[]} */
      const nativeCpuMs=[];
      /** @type {number[]} */
      const compiledCpuMs=[];
      for(let i=0;i<9;i++){
        let native;
        let transformed;
        if(i%2===0){
          native=sample(runnerPath,nativePath,count);
          transformed=sample(runnerPath,protectedPath,count);
        }else{
          transformed=sample(runnerPath,protectedPath,count);
          native=sample(runnerPath,nativePath,count);
        }
        assert.equal(transformed.digest,native.digest,'Original/generated CJS output parity');
        nativeCpuMs.push(native.cpuMs);
        compiledCpuMs.push(transformed.cpuMs);
      }
      // A short Windows child may report zero CPU ticks; preserve the sample
      // and classify its ratio as unresolved instead of dividing by zero.
      const pairedRatios=nativeCpuMs.map((ms,i)=>
        ms>0&&compiledCpuMs[i]>0?compiledCpuMs[i]/ms:null);
      const resolvedRatios=pairedRatios.filter(ratio=>ratio!==null);
      const nativeMedian=median(nativeCpuMs);
      const compiledMedian=median(compiledCpuMs);
      rows.push({
        calls:count,pairs:9,nativeCpuMs,compiledCpuMs,
        pairedRatios,
        ratioOfMedians:nativeMedian>0&&compiledMedian>0?compiledMedian/nativeMedian:null,
        maxPairedRatio:resolvedRatios.length?Math.max(...resolvedRatios):null,
        strictOverBudgetPairs:resolvedRatios.filter(ratio=>ratio>2.5).length,
        unresolvedZeroPairs:pairedRatios.length-resolvedRatios.length
      });
    }
    const summary={
      node:process.version,platform:process.platform,
      compiledPrivateOwnFields:compiled.metrics.properties,
      boundary:'Fresh Node process CPU from startup through CJS require and business calls; original and emitted modules loaded with same runner; no compiler/build CPU',
      rows,
      totalUnresolvedZeroPairs:rows.reduce((sum,row)=>sum+row.unresolvedZeroPairs,0)
    };
    process.stdout.write('STRAIGHTLINE_READER_COLD '+JSON.stringify(summary)+'\n');
    assert.equal(rows.reduce((sum,row)=>sum+row.strictOverBudgetPairs,0),0,
      'Observed fresh-process sampled CPU exceeds strict 2.5x budget');
    assert.equal(summary.totalUnresolvedZeroPairs,0,
      'Fresh-process CPU includes zero-tick samples; strict paired ratio unresolved');
    return summary;
  }finally{
    await fs.rm(workspace,{recursive:true,force:true});
  }
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
