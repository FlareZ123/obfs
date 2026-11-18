'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {sampleVerdict,summarizeEvidence}=require('../sims/release-evidence-gate');
const {familywiseBudgetBounds}=require('../sims/familywise-budget-bound');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

test('one-sided budget decisions retain failure and uncertainty',()=>{
  assert.equal(sampleVerdict([{decision:'supported'},{decision:'supported'}]),
    'sample-supported');
  assert.equal(sampleVerdict([{decision:'supported'},{decision:'exceeded'}]),
    'sample-exceeded');
  assert.equal(sampleVerdict([{decision:'supported'},{decision:'inconclusive'}]),
    'sample-inconclusive');
  assert.equal(sampleVerdict([]),'sample-inconclusive');
});

/** @returns {Parameters<typeof summarizeEvidence>} */
function examples(){
  const coo={
    functionRecovery:3,
    sourceHashes:{native:'native',published:'published',reconstructed:'recovered'},
    rows:[1,50,1000,10000].map(events=>({
      events,publishedVsNative:{
        ratioOfMedians:events===1?3.2:1.4,
        decision:events===1?'exceeded':'supported',
        upperMedianBound:events===1?4.1:1.6,
        samplePairs:9,confidenceAttained:0.98
      },
      sourceBytes:{native:2467,published:7518,reconstructed:2362},
      rawSamples:{native:Array(9).fill(1),published:Array(9).fill(events===1?3.2:1.4),reconstructed:Array(9).fill(1.1)},
      ratioReconstructedToPublishedMedians:0.9
    }))
  };
  const sno={
    selectedFunctions:3,staticComparisons:12288,offlineClone:true,
    staticRecovered:3,runtimeHooked:true,directEsmClone:true,
    manifestForged:true,runtimeDiskMutations:0
  };
  const snoProfile=[1,50,1000,10000].map(events=>{
    const native=Array(13).fill(1);
    const sno=Array(13).fill(events===1?3.5:1.2);
    return {events,ratio:events===1?3.5:1.2,
      pairedBound:pairedBudgetBound(native,sno),rawTimingMs:{native,sno}};
  });
  const sco={
    semanticsPreserved:true,
    light:{count:1,ratio:4.2,samples:{native:Array(9).fill(1),remote:Array(9).fill(4.2)},
      pairedMedianBound:{decision:'exceeded',lowerMedianBound:3.8,upperMedianBound:5.1,confidenceAttained:0.98}},
    heavy:{count:120000,ratio:2.1,samples:{native:Array(9).fill(10),remote:Array(9).fill(21)},
      pairedMedianBound:{decision:'supported',lowerMedianBound:1.7,upperMedianBound:2.4,confidenceAttained:0.98}},
    measuredBoundary:'fresh process to result',caveat:'loopback only'
  };
  return [coo,sno,snoProfile,sco];
}

test('release evidence separates cloned functionality from source disclosure',()=>{
  const summary=summarizeEvidence(...examples());
  assert.equal(summary.verdict,'RELEASE-BLOCKED');
  assert.deepEqual(summary.attackedModes,['coo','sno','sco']);
  assert.equal(summary.attackEvidence.coo.recoveredFunctions,3);
  assert.equal(summary.attackEvidence.coo.verdict,'demonstrated-functional-clone');
  assert.equal(summary.attackEvidence.coo.sourceExtraction,'not-measured');
  assert.equal(summary.attackEvidence.sno.heldoutComparisons,12288);
  assert.equal(summary.attackEvidence.sno.manifestForged,true);
  assert.equal(summary.attackEvidence.sno.runtimeHooked,true);
  assert.equal(summary.attackEvidence.sco.unauthorizedTokenBypass,'not-measured');
  assert.equal(summary.attackEvidence.sco.privateSourceExtraction,'not-measured');
  assert.equal(summary.securityAxes.staticReconstruction.coo,'recovered-selected-functions');
  assert.equal(summary.securityAxes.staticReconstruction.sno,'recovered-selected-functions');
  assert.equal(summary.securityAxes.staticReconstruction.sco,
    'not-measured-private-code-remains-server-side');
  assert.equal(summary.securityAxes.dynamicInstrumentation.coo,'not-measured');
  assert.equal(summary.securityAxes.dynamicInstrumentation.sno,'owner-loader-substitution');
  assert.equal(summary.securityAxes.unauthorizedModification.sno,'public-manifest-forged');
  assert.equal(summary.securityAxes.environmentControl.sco,
    'unauthorized-token-bypass-not-measured');
  assert.equal(summary.securityAxes.authorizedServiceRelay.sco,
    'legitimate-token-relay-reproduces-output');
  assert.equal(summary.performance.coo.verdict,'sample-exceeded');
  assert.equal(summary.performance.sno.verdict,'sample-exceeded');
  assert.equal(summary.performance.sco.verdict,'sample-exceeded');
  assert.equal(summary.performance.coo.rows.length,4);
  assert.equal(summary.performance.sno.rows.length,4);
  assert.equal(summary.performance.sco.rows.length,2);
  assert.equal(summary.performance.crossModeFamilywise.comparisons,10);
  assert.equal(summary.performance.crossModeFamilywise.verdict,'sample-exceeded');
  assert.ok(summary.performance.crossModeFamilywise.confidenceAttainedAtLeast>=0.95);
  assert.equal(summary.performance.crossModeFamilywise.observedOverBudgetPairs,31);
  assert.equal(summary.performance.crossModeFamilywise.observedSampleHasOverBudgetPair,true);
  assert.equal(summary.performance.crossModeFamilywise.observedMaxPairedRatio,4.2);
  const strict=summary.performance.crossModeFamilywise.strictTail;
  assert.equal(strict.confidenceRequested,0.95);
  assert.equal(strict.perWorkloadConfidenceRequested,0.995);
  assert.equal(strict.upperViolationRateWhenZero.length,10);
  assert.equal(strict.upperViolationRateWhenZero[0],null,'COO short-session overbudget');
  assert.equal(strict.upperViolationRateWhenZero[4],null,'SNO short-session overbudget');
  assert.equal(strict.upperViolationRateWhenZero[8],null,'SCO light-session overbudget');
  assert.ok(strict.upperViolationRateWhenZero[1]!==null);
  assert.ok(strict.upperViolationRateWhenZero[9]!==null);
  assert.deepEqual(summary.performance.crossModeFamilywise.workloads.map(row=>row.mode),
    ['coo','coo','coo','coo','sno','sno','sno','sno','sco','sco']);
  assert.equal(summary.performance.coo.rows[0].rawTimingMs.native.length,9);
  assert.equal(summary.performance.coo.rows[0].sourceBytes.native,2467);
  assert.equal(summary.performance.sco.rows[0].rawTimingMs.remote.length,9);
  assert.equal(summary.performance.sco.rows[0].upperMedianBound,5.1);
  assert.deepEqual(summary.performance.sno.descriptiveOverBudgetEvents,[1]);
  assert.equal(summary.performance.sno.rows[0].oneSidedMedianDecision,'exceeded');
  assert.equal(summary.performance.sno.rows[1].oneSidedMedianDecision,'supported');
  assert.equal(summary.performance.sno.rows[0].samplePairs,13);
  assert.equal(summary.performance.sno.rows[0].rawTimingMs.native.length,13);
  assert.equal(summary.performance.sno.rows[0].rawTimingMs.sno.length,13);
  assert.ok(summary.performance.sno.rows[1].upperMedianBound<2.5);
  assert.equal(summary.performance.crossModeFamilywise.bounds.length,10);
  assert.equal(summary.performance.crossModeFamilywise.bounds[4].decision,'exceeded');
  assert.equal(summary.performance.crossModeFamilywise.bounds[5].decision,'supported');
});

test('release evidence rejects vacuous or incomplete controls',()=>{
  const [coo,sno,snoProfile,sco]=examples();
  assert.throws(()=>summarizeEvidence(
    {...coo,functionRecovery:0},sno,snoProfile,sco),/three protected functions/u);
  assert.throws(()=>summarizeEvidence(coo,
    {...sno,selectedFunctions:0},snoProfile,sco),/three protected functions/u);
  assert.throws(()=>summarizeEvidence(coo,sno,snoProfile,
    {...sco,semanticsPreserved:false}),/SCO relay/u);
  assert.throws(()=>summarizeEvidence({...coo,rows:[]},sno,snoProfile,sco),
    /short and sustained sessions/u);
});

test('familywise paired budget allocates both tails across all tested workloads',()=>{
  const workloads=Array.from({length:6},(_,i)=>({
    native:Array(9).fill(1),
    candidate:Array(9).fill(i===3?3.1:1.25)
  }));
  const bound=familywiseBudgetBounds(workloads);
  assert.equal(bound.comparisons,6);
  assert.equal(bound.observedOverBudgetPairs,9);
  assert.equal(bound.observedMaxPairedRatio,3.1);
  assert.equal(bound.observedSampleHasOverBudgetPair,true);
  assert.equal(bound.verdict,'sample-exceeded');
  assert.ok(bound.confidenceRequested===0.95);
  assert.ok(bound.perTailConfidenceRequested>0.995);
  assert.ok(bound.familywiseCoverageAtLeast>=0.95);
  assert.deepEqual(bound.rows.map(row=>row.decision),[
    'supported','supported','supported','exceeded','supported','supported'
  ]);
  assert.equal(familywiseBudgetBounds(
    workloads.map(row=>({...row,candidate:Array(9).fill(1.25)})
  )).verdict,'sample-supported');
  assert.equal(familywiseBudgetBounds(
    workloads.map(row=>({...row,candidate:[1,1,1,1,1,1,1,1,4]})
  )).verdict,'sample-inconclusive');
  const rareBreach=familywiseBudgetBounds(
    workloads.map(row=>({...row,candidate:[1,1,1,1,1,1,1,1,4]}))
  );
  assert.equal(rareBreach.observedMaxPairedRatio,4);
  assert.equal(rareBreach.observedOverBudgetPairs,6);
  assert.equal(rareBreach.observedSampleHasOverBudgetPair,true);
});

test('familywise median support never hides a sampled hard-threshold breach',()=>{
  const datasets=Array.from({length:10},(_,i)=>({
    native:Array(13).fill(1),
    candidate:i===0?
      [...Array(12).fill(1.25),3.5]:Array(13).fill(1.25)
  }));
  const report=familywiseBudgetBounds(datasets);
  assert.equal(report.comparisons,10);
  // Rank 12/13 supports the median despite one high outlier. The raw
  // observed strict-budget violation must remain independently visible.
  assert.equal(report.verdict,'sample-supported');
  assert.equal(report.rows[0].decision,'supported');
  assert.equal(report.observedOverBudgetPairs,1);
  assert.equal(report.observedMaxPairedRatio,3.5);
  assert.equal(report.observedSampleHasOverBudgetPair,true);
});

test('familywise bounds reject too few samples to meet joint confidence',()=>{
  assert.throws(()=>familywiseBudgetBounds([]),/At least one paired workload/u);
  assert.throws(()=>familywiseBudgetBounds([{
    native:Array(5).fill(1),candidate:Array(5).fill(1.25)
  }]),/Too few paired samples/u);
  assert.throws(()=>familywiseBudgetBounds([{
    native:Array(9).fill(1),candidate:Array(9).fill(1.25)
  }],{confidence:1}),/Familywise confidence/u);
});


/**
 * @returns {NonNullable<Parameters<typeof summarizeEvidence>[4]>}
 */
function residentExample(){
  /** @param {number} events @param {number} repetitions */
  const row=(events,repetitions)=>{
    const native=Array(13).fill(10);
    const sno=Array(13).fill(12.5);
    const measured=pairedBudgetBound(native,sno);
    return {
      events,repetitions,
      nativeMs:native,snoMs:sno,nativeCpuMs:native,snoCpuMs:sno,
      budget:measured,cpuBudget:measured,
      strictOverBudgetPairs:0,strictCpuOverBudgetPairs:0,
      allOutputsEquivalent:true
    };
  };
  return {
    source:'sims/sno-resident-budget.js',
    node:process.version,platform:process.platform,
    compact:false,initializationExcluded:true,
    rows:[[1,50000],[50,2500],[1000,80],[10000,5]].map(([a,b])=>row(a,b)),
    leafRows:[40000000,80000000].map(repeat=>row(0,repeat))
  };
}

test('SNO cold end-to-end time cannot substitute for resident post-init CPU in strict budget',()=>{
  const old=summarizeEvidence(...examples());
  assert.equal(old.performance.computeBoundaryFamilywise,null);
  assert.equal(old.performance.snoPostInit.verdict,'unmeasured');
  const evidence=summarizeEvidence(...examples(),residentExample());
  assert.equal(evidence.verdict,'RELEASE-BLOCKED');
  assert.equal(evidence.performance.sno.verdict,'sample-exceeded');
  assert.match(evidence.performance.sno.boundary,/COLD end-to-end/u);
  assert.equal(evidence.performance.snoPostInit.verdict,'sample-supported');
  assert.equal(evidence.performance.snoPostInit.applicationVerdict,'sample-supported');
  assert.equal(evidence.performance.snoPostInit.selectedLeafVerdict,'sample-supported');
  assert.equal(evidence.performance.snoPostInit.strictObservedVerdict,'no-observed-exceedances');
  assert.equal(evidence.performance.snoPostInit.rows.length,4);
  assert.equal(evidence.performance.snoPostInit.leafRows.length,2);
  assert.equal(evidence.performance.snoPostInit.rows[0].samplePairs,13);
  assert.equal(evidence.performance.snoPostInit.rows[0].ratioOfMedians,1.25);
  assert.equal(evidence.performance.snoPostInit.rows[0].strictObservedCpuOverBudgetPairs,0);
  assert.deepEqual(evidence.performance.snoPostInit.rows[0].rawCpuTimeMs.native,
    Array(13).fill(10));
  const budget=evidence.performance.computeBoundaryFamilywise;
  assert.ok(budget);
  assert.equal(budget.comparisons,12);
  assert.equal(budget.observedOverBudgetPairs,18);
  assert.equal(budget.observedMaxPairedRatio,4.2);
  assert.equal(budget.workloads.filter(row=>row.mode==='sno-postinit-cpu').length,4);
  assert.equal(budget.workloads.filter(row=>row.mode==='sno-postinit-leaf-cpu').length,2);
  assert.equal(budget.bounds[4].decision,'supported');
  assert.equal(budget.bounds[8].decision,'supported');
  assert.equal(evidence.performance.crossModeFamilywise.observedOverBudgetPairs,31,
    'Historical cold evidence remains intact');
});

test('SNO post-init admission rejects source and workload mismatch before a release claim',()=>{
  const original=residentExample();
  const inputs=examples();
  assert.throws(()=>summarizeEvidence(...inputs,{
    ...original,initializationExcluded:false
  }),/exclude initialization/u);
  assert.throws(()=>summarizeEvidence(...inputs,{
    ...original,compact:true
  }),/noncompact/u);
  assert.throws(()=>summarizeEvidence(...inputs,{
    ...original,rows:original.rows.slice(1)
  }),/four application workloads/u);
  assert.throws(()=>summarizeEvidence(...inputs,{
    ...original,rows:original.rows.map((row,i)=>i===0?{
      ...row,allOutputsEquivalent:false
    }:row)
  }),/output parity/u);
});


test('Selected-function hot-path overhead vetoes SNO compute despite green application averages',()=>{
  const inputs=examples();
  const original=residentExample();
  const slow=Array(13).fill(200);
  const native=Array(13).fill(10);
  const leaf={
    ...original.leafRows[0],
    snoMs:slow,snoCpuMs:slow,
    cpuBudget:pairedBudgetBound(native,slow),
    budget:pairedBudgetBound(native,slow),
    strictOverBudgetPairs:13,
    strictCpuOverBudgetPairs:13
  };
  const result=summarizeEvidence(...inputs,{
    ...original,leafRows:[leaf,original.leafRows[1]]
  });
  const p=result.performance;
  assert.ok(p.computeBoundaryFamilywise);
  assert.equal(p.snoPostInit.applicationVerdict,'sample-supported');
  assert.equal(p.snoPostInit.selectedLeafVerdict,'sample-exceeded');
  assert.equal(p.snoPostInit.verdict,'sample-exceeded');
  assert.equal(p.snoPostInit.strictObservedVerdict,'sample-exceeded');
  assert.equal(p.computeBoundaryFamilywise.comparisons,12);
  assert.equal(p.computeBoundaryFamilywise.bounds[8].decision,'exceeded');
  assert.equal(p.computeBoundaryFamilywise.observedMaxPairedRatio,20);
  assert.equal(p.computeBoundaryFamilywise.observedOverBudgetPairs,31);
  assert.equal(p.computeBoundaryFamilywise.strictObservedVerdict,'sample-exceeded');
  assert.equal(result.verdict,'RELEASE-BLOCKED');
});

test('SNO resident raw strict counts must match the same paired CPU and wall samples',()=>{
  const source=residentExample();
  const malformed=source.rows.map((row,i)=>i===0?{
    ...row,strictCpuOverBudgetPairs:2
  }:row);
  assert.throws(()=>summarizeEvidence(...examples(),{
    ...source,rows:malformed
  }),/CPU strict-overbudget count/u);
});
