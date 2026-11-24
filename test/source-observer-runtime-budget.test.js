'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {main}=require('../sims/source-observer-runtime-budget');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');
const {familywiseBudgetBounds}=require('../sims/familywise-budget-bound');

test('current COO source-observer startup reports median and strict budget evidence',async()=>{
  /** @type {{platform:string,cpuBatchSize:number,workloads:Array<{workload:string,baselineSamplesMs:number[],obfuscatedSamplesMs:number[],baselineCpuSamplesMs:number[],obfuscatedCpuSamplesMs:number[],placeboLeftSamplesMs:number[],placeboRightSamplesMs:number[],placeboLeftCpuSamplesMs:number[],placeboRightCpuSamplesMs:number[],strictBreachCount:number,strictBreachSamples:Array<{sample:number,ratio:number}>}>}} */
  const report=/** @type {unknown} */ (await main());
  assert.equal(report.workloads.length,2);
  const workloads=report.workloads.map(workload=>({
    native:workload.baselineSamplesMs,candidate:workload.obfuscatedSamplesMs
  }));
  const familywise=familywiseBudgetBounds(workloads,{threshold:2.5,confidence:0.95});
  const placeboFamilywise=familywiseBudgetBounds(report.workloads.map(workload=>({
    native:workload.placeboLeftSamplesMs,candidate:workload.placeboRightSamplesMs
  })),{threshold:2.5,confidence:0.95});
  const cpuDiagnostics=report.workloads.map(workload=>({
    name:workload.workload,
    nativeZero:workload.baselineCpuSamplesMs.filter(value=>value<=0||!Number.isFinite(value)).length,
    candidateZero:workload.obfuscatedCpuSamplesMs.filter(value=>value<=0||!Number.isFinite(value)).length,
    nativeMin:Math.min(...workload.baselineCpuSamplesMs),
    candidateMin:Math.min(...workload.obfuscatedCpuSamplesMs),
    nativeMax:Math.max(...workload.baselineCpuSamplesMs),
    candidateMax:Math.max(...workload.obfuscatedCpuSamplesMs)
  }));
  process.stdout.write('SOURCE_OBSERVER_CPU_RAW_DIAGNOSTICS '+JSON.stringify({
    platform:report.platform,cpuBatchSize:report.cpuBatchSize,workloads:cpuDiagnostics
  })+'\n');
  const cpuValid=report.workloads.every(workload=>
    [...workload.baselineCpuSamplesMs,...workload.obfuscatedCpuSamplesMs].every(value=>Number.isFinite(value)&&value>0));
  const cpuPlaceboValid=report.workloads.every(workload=>
    [...workload.placeboLeftCpuSamplesMs,...workload.placeboRightCpuSamplesMs].every(value=>Number.isFinite(value)&&value>0));
  const cpuFamilywise=cpuValid?familywiseBudgetBounds(report.workloads.map(workload=>({
    native:workload.baselineCpuSamplesMs,candidate:workload.obfuscatedCpuSamplesMs
  })),{threshold:2.5,confidence:0.95}):null;
  const cpuPlaceboFamilywise=cpuPlaceboValid?familywiseBudgetBounds(report.workloads.map(workload=>({
    native:workload.placeboLeftCpuSamplesMs,candidate:workload.placeboRightCpuSamplesMs
  })),{threshold:2.5,confidence:0.95}):null;
  process.stdout.write('SOURCE_OBSERVER_CURRENT_FAMILYWISE_BUDGET '+JSON.stringify({
    platform:report.platform,cpuBatchSize:report.cpuBatchSize,
    workloads:report.workloads.map(workload=>({
      name:workload.workload,strictBreachCount:workload.strictBreachCount,
      strictBreachSamples:workload.strictBreachSamples
    })),
    medianFamilywise:familywise,
    strictObservedVerdict:familywise.observedSampleHasOverBudgetPair?'sample-exceeded':'sample-clean',
    placeboFamilywise,
    cpuValid,cpuFamilywise,
    cpuStrictObservedVerdict:cpuFamilywise?(cpuFamilywise.observedSampleHasOverBudgetPair?'sample-exceeded':'sample-clean'):'inconclusive',
    cpuPlaceboValid,cpuPlaceboFamilywise
  })+'\n');
  assert.ok(familywise.rows.every(row=>row.samplePairs===31));
  assert.ok(placeboFamilywise.rows.every(row=>row.samplePairs===31));
  for(const [index,workload] of report.workloads.entries()) {
    const bound=pairedBudgetBound(workload.baselineSamplesMs,workload.obfuscatedSamplesMs,
      {threshold:2.5,confidence:0.95});
    const cpuValidForWorkload=[...workload.baselineCpuSamplesMs,...workload.obfuscatedCpuSamplesMs]
      .every(value=>Number.isFinite(value)&&value>0);
    const cpuBound=cpuValidForWorkload?pairedBudgetBound(workload.baselineCpuSamplesMs,workload.obfuscatedCpuSamplesMs,
      {threshold:2.5,confidence:0.95}):null;
    const cpuRatios=cpuValidForWorkload?
      workload.obfuscatedCpuSamplesMs.map((value,index)=>value/workload.baselineCpuSamplesMs[index]):[];
    process.stdout.write('SOURCE_OBSERVER_CURRENT_PAIRED_BOUND '+JSON.stringify({
      platform:report.platform,workload:workload.workload,...bound,
      simStrictBreachCount:workload.strictBreachCount,
      familywiseObservedPairsWithinBudget:familywise.rows[index].observedPairsWithinBudget,
      cpuBound,
      cpuStrictBreachCount:cpuValidForWorkload?cpuRatios.filter(value=>value>2.5).length:null,
      cpuMedianPairedRatio:cpuBound.medianOfPairedRatios,
      cpuMaxPairedRatio:cpuValidForWorkload?Math.max(...cpuRatios):null,
      cpuFamilywiseObservedPairsWithinBudget:cpuFamilywise?.rows[index]?.observedPairsWithinBudget??null
    })+'\n');
  }
});
