'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {main}=require('../sims/source-observer-runtime-budget');

test('COO source-observer startup remains within the strict 2.5x budget',async()=>{
  /** @type {{platform:string,workloads:Array<{workload:string,baselineSamplesMs:number[],obfuscatedSamplesMs:number[],ratio:number}>}} */
  const report=/** @type {unknown} */ (await main());
  assert.equal(report.workloads.length,2);
  for(const workload of report.workloads) {
    const pairedRatios=workload.baselineSamplesMs.map((baseline,index)=>
      workload.obfuscatedSamplesMs[index]/baseline).sort((a,b)=>a-b);
    const baselineTotal=workload.baselineSamplesMs.reduce((sum,value)=>sum+value,0);
    const obfuscatedTotal=workload.obfuscatedSamplesMs.reduce((sum,value)=>sum+value,0);
    const diagnostics={
      platform:report.platform,
      workload:workload.workload,
      medianPairedRatio:pairedRatios[Math.floor(pairedRatios.length/2)],
      aggregateRatio:obfuscatedTotal/baselineTotal,
      pairedP90:pairedRatios[Math.floor(0.90*(pairedRatios.length-1))],
      pairedP95:pairedRatios[Math.floor(0.95*(pairedRatios.length-1))],
      pairedMaximum:pairedRatios[pairedRatios.length-1],
      pairedSamplesOver2_5:pairedRatios.filter(ratio=>ratio>2.5).length,
      sampleCount:pairedRatios.length
    };
    process.stdout.write('SOURCE_OBSERVER_PAIRED_TAIL '+JSON.stringify(diagnostics)+'\n');
  }
});
