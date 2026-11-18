'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {familywiseBudgetBounds}=require('./familywise-budget-bound');
const {runEvidence:runCooEvidence}=require('./polyvariant-app-three-way-budget');
const {runEvidence:runSnoEvidence,profile:profileSno}=require('./polyvariant-app-sno');
const {run:runSnoResidentEvidence}=require('./sno-resident-budget');

const execFileAsync=promisify(execFile);

/**
 * A bounded verdict, deliberately avoiding any implication that a finite
 * compatibility run or an unattempted attack establishes hostile-runtime
 * security. These are observations about three concrete applications.
 *
 * @typedef {'demonstrated-functional-clone'|'unmeasured'} AttackVerdict
 * @typedef {'sample-supported'|'sample-exceeded'|'sample-inconclusive'} BudgetVerdict
 */

/**
 * @param {Array<{decision:string}>} samples
 * @returns {BudgetVerdict}
 */
function sampleVerdict(samples){
  if(samples.some(sample=>sample.decision==='exceeded'))return 'sample-exceeded';
  if(samples.length && samples.every(sample=>sample.decision==='supported'))
    return 'sample-supported';
  return 'sample-inconclusive';
}

/**
 * @typedef {{
 *  count:number,ratio:number,
 *  pairedMedianBound:{
 *    decision:string,lowerMedianBound:number,upperMedianBound:number,
 *    confidenceAttained:number
 *  },
 *  samples:{native:number[],remote:number[]}
 * }} ScoWorkload
 * @typedef {{
 *  semanticsPreserved:boolean,
 *  heavy:ScoWorkload,light:ScoWorkload,
 *  measuredBoundary:string,caveat:string
 * }} ScoSessionEvidence
 */

/**
 * Keep provenance and security dimensions separate. The COO and SNO
 * implementations are tested on the same frozen three-module stateful
 * application; SCO uses the established six-module private-service fixture.
 *
 * @param {Awaited<ReturnType<typeof runCooEvidence>>} coo
 * @param {Awaited<ReturnType<typeof runSnoEvidence>>} sno
 * @param {Awaited<ReturnType<typeof profileSno>>} snoProfile
 * @param {ScoSessionEvidence} sco
 * @param {Awaited<ReturnType<typeof runSnoResidentEvidence>>} [snoResident] Same-source SNO post-initialization CPU/wall evidence.
 * @returns {object}
 */
function summarizeEvidence(coo,sno,snoProfile,sco,snoResident){
  assert.equal(coo.functionRecovery,3,'COO control must exercise three protected functions');
  assert.equal(sno.selectedFunctions,3,'SNO control must exercise three protected functions');
  assert.equal(sno.staticComparisons,12288,'SNO held-out control must actually run');
  assert.equal(coo.rows.length,4,'COO must include short and sustained sessions');
  assert.equal(snoProfile.length,4,'SNO must include short and sustained sessions');
  assert.equal(sco.semanticsPreserved,true,'SCO relay must retain expected semantics');
  const cooBudget=coo.rows.map(row=>({
    events:row.events,ratioOfMedians:row.publishedVsNative.ratioOfMedians,
    oneSidedMedianDecision:row.publishedVsNative.decision,
    upperMedianBound:row.publishedVsNative.upperMedianBound,
    recoveredToPublishedMedianRatio:row.ratioReconstructedToPublishedMedians,
    pairs:row.publishedVsNative.samplePairs,
    oneSidedConfidenceAttained:row.publishedVsNative.confidenceAttained,
    sourceBytes:row.sourceBytes,rawTimingMs:row.rawSamples
  }));
  const snoBudget=snoProfile.map(row=>({
    events:row.events,ratioOfMedians:row.ratio,
    oneSidedMedianDecision:row.pairedBound.decision,
    samplePairs:row.pairedBound.samplePairs,
    lowerMedianBound:row.pairedBound.lowerMedianBound,
    upperMedianBound:row.pairedBound.upperMedianBound,
    oneSidedConfidenceAttained:row.pairedBound.confidenceAttained,
    medianOfPairedRatios:row.pairedBound.medianOfPairedRatios,
    rawTimingMs:row.rawTimingMs
  }));
  const scoBudget=(/** @type {Array<['light'|'heavy',ScoWorkload]>} */ ([
    ['light',sco.light],['heavy',sco.heavy]
  ])).map(([label,data])=>({
    workload:label,events:data.count,ratioOfMedians:data.ratio,
    oneSidedMedianDecision:data.pairedMedianBound.decision,
    lowerMedianBound:data.pairedMedianBound.lowerMedianBound,
    upperMedianBound:data.pairedMedianBound.upperMedianBound,
    oneSidedConfidenceAttained:data.pairedMedianBound.confidenceAttained,
    rawTimingMs:data.samples
  }));
  // All ten paired COO/SNO/SCO workload populations share one Bonferroni
  // familywise control. Raw samples and tested execution boundaries are
  // preserved separately; no universal budget guarantee follows.
  const familywise=familywiseBudgetBounds([
    ...cooBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.published})),
    ...snoBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.sno})),
    ...scoBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.remote}))
  ]);
  // SNO starts and verifies its manifest before READY. Only the resident
  // worker's actual repeated application CPU is eligible for the prompt's
  // post-initialization SNO 2.5x compute bound. Preserve the separately
  // measured fresh-process latency as an operational, cold-start metric.
  /** @type {Array<{
   * events:number,repetitions:number,ratioOfMedians:number,
   * wallRatioOfMedians:number,oneSidedMedianDecision:string,
   * samplePairs:number,upperMedianBound:number,
   * strictObservedCpuOverBudgetPairs:number,
   * strictObservedWallOverBudgetPairs:number,
   * rawCpuTimeMs:{native:number[],sno:number[]},
   * rawWallTimeMs:{native:number[],sno:number[]}
   * }>} */
  const snoPostInitRows=[];
  /** @type {typeof snoPostInitRows} */
  const snoPostInitLeafRows=[];
  if(snoResident){
    assert.equal(snoResident.source,'sims/sno-resident-budget.js');
    assert.equal(snoResident.initializationExcluded,true,
      'SNO resident timing must exclude initialization for both variants');
    assert.equal(snoResident.compact,false,
      'SNO comparison must use the same noncompact selected backend');
    assert.equal(snoResident.rows.length,4,
      'SNO resident comparison must preserve four application workloads');
    assert.equal(snoResident.leafRows.length,2,
      'SNO resident comparison must retain two selected-function stress controls');
    // Pin the actual protected-work populations, not merely their count.
    // A changed resident producer must receive an explicit audit update
    // before its timings can be called the same twelve-workload experiment.
    assert.deepEqual(snoResident.rows.map(row=>[row.events,row.repetitions]),[
      [1,50000],[50,2500],[1000,80],[10000,5]
    ],'SNO resident application workloads changed');
    assert.deepEqual(snoResident.leafRows.map(row=>[row.events,row.repetitions]),[
      [0,40000000],[0,80000000]
    ],'SNO selected-function stress workloads changed');
    // Both series contain ResidentRow values. Concatenating them before
    // mapping avoids mixing resident inputs with summarized output types.
    for(const [index,row] of snoResident.rows.concat(snoResident.leafRows).entries()){
      const destination=index<snoResident.rows.length?
        snoPostInitRows:snoPostInitLeafRows;
      assert.equal(row.allOutputsEquivalent,true,
        'SNO post-initialization work must retain original output parity');
      assert.equal(row.cpuBudget.samplePairs,row.nativeCpuMs.length);
      assert.equal(row.nativeCpuMs.length,row.snoCpuMs.length);
      assert.equal(row.nativeMs.length,row.snoMs.length);
      assert.equal(row.nativeMs.length,row.nativeCpuMs.length);
      assert.equal(row.strictCpuOverBudgetPairs,
        row.nativeCpuMs.filter((native,i)=>row.snoCpuMs[i]>2.5*native).length,
        'Resident CPU strict-overbudget count contradicts the raw paired measurements');
      assert.equal(row.strictOverBudgetPairs,
        row.nativeMs.filter((native,i)=>row.snoMs[i]>2.5*native).length,
        'Resident wall strict-overbudget count contradicts the raw paired measurements');
      destination.push({
        events:row.events,repetitions:row.repetitions,
        ratioOfMedians:row.cpuBudget.ratioOfMedians,
        wallRatioOfMedians:row.budget.ratioOfMedians,
        oneSidedMedianDecision:row.cpuBudget.decision,
        samplePairs:row.cpuBudget.samplePairs,
        upperMedianBound:row.cpuBudget.upperMedianBound,
        strictObservedCpuOverBudgetPairs:row.strictCpuOverBudgetPairs,
        strictObservedWallOverBudgetPairs:row.strictOverBudgetPairs,
        rawCpuTimeMs:{native:row.nativeCpuMs,sno:row.snoCpuMs},
        rawWallTimeMs:{native:row.nativeMs,sno:row.snoMs}
      });
    }
  }
  // The strict compute interpretation uses post-init SNO process CPU,
  // whereas the historical ten-workload join above retains cold SNO startup
  // latency. Only same-invocation, same-source measurements may be combined.
  const computeFamilywise=snoResident?familywiseBudgetBounds([
    ...cooBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.published})),
    ...snoPostInitRows.map(row=>({native:row.rawCpuTimeMs.native,
      candidate:row.rawCpuTimeMs.sno})),
    // The selected arithmetic functions are directly invoked at high volume;
    // omitting them would conceal genuine 18x–36x tested hot-path overhead.
    ...snoPostInitLeafRows.map(row=>({native:row.rawCpuTimeMs.native,
      candidate:row.rawCpuTimeMs.sno})),
    ...scoBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.remote}))
  ]):null;
  const attackEvidence={
    coo:{
      verdict:coo.functionRecovery===3?'demonstrated-functional-clone':'unmeasured',
      entry:'public-only source reconstruction',recoveredFunctions:coo.functionRecovery,
      graphHashes:coo.sourceHashes,heldoutApplicationParity:true,
      sourceExtraction:'not-measured',originalPrivateSourceUsedByAttacker:false
    },
    sno:{
      verdict:sno.offlineClone&&sno.staticRecovered===sno.selectedFunctions&&
        sno.runtimeHooked?'demonstrated-functional-clone':'unmeasured',
      entry:'public-only reconstruction, digest-manifest rewrite and ESM runtime hook',
      selectedFunctions:sno.selectedFunctions,recoveredFunctions:sno.staticRecovered,
      heldoutComparisons:sno.staticComparisons,
      offlineClone:sno.offlineClone,directEsmClone:sno.directEsmClone,
      manifestForged:sno.manifestForged,runtimeHooked:sno.runtimeHooked,
      runtimeDiskMutations:sno.runtimeDiskMutations
    },
    sco:{
      verdict:sco.semanticsPreserved?'demonstrated-functional-clone':'unmeasured',
      entry:'authorized-token remote facade relay reproduces service outputs',
      privateSourceExtraction:'not-measured',
      unauthorizedTokenBypass:'not-measured',
      sameAccountFunctionalReplay:sco.semanticsPreserved,
      measurementBoundary:sco.measuredBoundary
    }
  };
  const performance={
    crossModeFamilywise:{
      verdict:familywise.verdict,
      strictObservedVerdict:familywise.observedOverBudgetPairs>0?
        'sample-exceeded':'no-observed-exceedances',
      confidenceRequested:familywise.confidenceRequested,
      confidenceAttainedAtLeast:familywise.familywiseCoverageAtLeast,
      perTailConfidenceRequested:familywise.perTailConfidenceRequested,
      comparisons:familywise.comparisons,
      observedMaxPairedRatio:familywise.observedMaxPairedRatio,
      observedOverBudgetPairs:familywise.observedOverBudgetPairs,
      observedSampleHasOverBudgetPair:familywise.observedSampleHasOverBudgetPair,
      // A simultaneous binomial bound on future breach frequency when zero
      // strict breaches were observed in a given workload. This differs from
      // confidence on the population median and cannot prove a worst-case cap.
      strictTail:familywise.strictTail,
      workloads:[
        ...cooBudget.map(row=>({mode:'coo',events:row.events})),
        ...snoBudget.map(row=>({mode:'sno',events:row.events})),
        ...scoBudget.map(row=>({mode:'sco',events:row.events}))
      ],
      bounds:familywise.rows.map(row=>({
        decision:row.decision,lowerMedianBound:row.lowerMedianBound,
        upperMedianBound:row.upperMedianBound,
        marginalOneSidedCoverage:row.confidenceAttained
      })),
      boundary:'Ten sampled COO/SNO/SCO workloads. COO reuses a Node process, SNO includes fresh Node startup, SCO uses fresh localhost clients. Within-workload representative independent pairs remain an assumption.'
    },
    computeBoundaryFamilywise:computeFamilywise?{
      verdict:computeFamilywise.verdict,
      strictObservedVerdict:computeFamilywise.observedOverBudgetPairs>0?
        'sample-exceeded':'no-observed-exceedances',
      comparisons:computeFamilywise.comparisons,
      confidenceRequested:computeFamilywise.confidenceRequested,
      confidenceAttainedAtLeast:computeFamilywise.familywiseCoverageAtLeast,
      observedMaxPairedRatio:computeFamilywise.observedMaxPairedRatio,
      observedOverBudgetPairs:computeFamilywise.observedOverBudgetPairs,
      observedSampleHasOverBudgetPair:computeFamilywise.observedSampleHasOverBudgetPair,
      strictTail:computeFamilywise.strictTail,
      workloads:[
        ...cooBudget.map(row=>({mode:'coo',events:row.events})),
        ...snoPostInitRows.map(row=>({mode:'sno-postinit-cpu',events:row.events,
          repetitions:row.repetitions})),
        ...snoPostInitLeafRows.map(row=>({mode:'sno-postinit-leaf-cpu',
          events:row.events,repetitions:row.repetitions})),
        ...scoBudget.map(row=>({mode:'sco',events:row.events}))
      ],
      bounds:computeFamilywise.rows.map(row=>({
        decision:row.decision,lowerMedianBound:row.lowerMedianBound,
        upperMedianBound:row.upperMedianBound,
        marginalOneSidedCoverage:row.confidenceAttained
      })),
      boundary:'Twelve current-source COO/SNO/SCO populations, including two direct selected-function SNO hot paths. COO samples native-vs-published Node duration; SNO uses repeated-work process CPU from prestarted manifest-verified workers; SCO measures fresh localhost service latency. Distinct runtime boundaries are compared, not an equal-application security theorem.'
    }:null,
    snoPostInit:snoResident?{
      verdict:sampleVerdict([...snoPostInitRows,...snoPostInitLeafRows].map(row=>({
        decision:row.oneSidedMedianDecision}))),
      strictObservedVerdict:[...snoPostInitRows,...snoPostInitLeafRows].some(row=>
        row.strictObservedCpuOverBudgetPairs>0)?
        'sample-exceeded':'no-observed-exceedances',
      applicationVerdict:sampleVerdict(snoPostInitRows.map(row=>({
        decision:row.oneSidedMedianDecision}))),
      selectedLeafVerdict:sampleVerdict(snoPostInitLeafRows.map(row=>({
        decision:row.oneSidedMedianDecision}))),
      rows:snoPostInitRows,leafRows:snoPostInitLeafRows,
      boundary:'Repeated in-worker business compute after startup, checksum and import. CPU includes only executed application work; symmetric native comparison; original artifact behavior and selected transforms verified.',
      coldSource:'performance.sno',
      note:'The two selected-leaf stress populations are included in the strict compute verdict and the twelve-workload familywise comparison. Application-level dilution of hot-leaf overhead cannot satisfy a universal 2.5x requirement; individual sampled breaches remain separately visible.'
    }:{verdict:'unmeasured',applicationVerdict:'unmeasured',
      selectedLeafVerdict:'unmeasured',strictObservedVerdict:'not-measured',
      rows:[],leafRows:[],
      boundary:'SNO post-initialization process CPU not supplied to this summary'},
    coo:{verdict:sampleVerdict(cooBudget.map(row=>({
      decision:row.oneSidedMedianDecision}))),rows:cooBudget,
      boundary:'module graph loaded anew per trial; Node process reused'},
    sno:{verdict:sampleVerdict(snoBudget.map(row=>({
      decision:row.oneSidedMedianDecision
    }))),rows:snoBudget,
      descriptiveOverBudgetEvents:snoBudget.filter(row=>
        row.ratioOfMedians>2.5).map(row=>row.events),
      boundary:'Operational COLD end-to-end latency: fresh Node child process per pair, including manifest verification and module import. Excluded from the post-init strict compute interpretation; one-sided bounds cover median paired ratios, not worst-case sessions'},
    sco:{verdict:sampleVerdict(scoBudget.map(row=>({
      decision:row.oneSidedMedianDecision}))),rows:scoBudget,
      boundary:sco.measuredBoundary,caveat:sco.caveat}
  };
  // Every requested resistance axis is reported independently. A legitimate
  // online relay is evidence of reproducible authorized functionality, not
  // evidence that service credentials or private server code were stolen.
  const securityAxes={
    staticReconstruction:{
      coo:coo.functionRecovery===3?'recovered-selected-functions':'not-established',
      sno:sno.staticRecovered===sno.selectedFunctions?
        'recovered-selected-functions':'not-established',
      sco:'not-measured-private-code-remains-server-side'
    },
    dynamicInstrumentation:{
      coo:'not-measured',
      sno:sno.runtimeHooked?'owner-loader-substitution':'not-established',
      sco:'not-measured'
    },
    unauthorizedModification:{
      coo:'not-measured',
      sno:sno.manifestForged?'public-manifest-forged':'not-established',
      sco:'not-measured'
    },
    environmentControl:{
      coo:'reconstructed-public-code-runs-offline',
      sno:sno.offlineClone&&sno.directEsmClone?
        'owner-copied-public-code-runs-offline':'not-established',
      sco:'unauthorized-token-bypass-not-measured'
    },
    authorizedServiceRelay:{
      coo:'not-applicable',sno:'not-applicable',
      sco:sco.semanticsPreserved?'legitimate-token-relay-reproduces-output':
        'not-established'
    }
  };
  const failedSecurity=Object.entries(attackEvidence).filter(([,value])=>
    value.verdict==='demonstrated-functional-clone').map(([name])=>name);
  return {
    verdict:'RELEASE-BLOCKED',
    reason:'The tested delivery is reproducible from public files or legitimate service queries; the required general 2.5x and hostile-runtime guarantees remain unestablished',
    attackedModes:failedSecurity,
    attackEvidence,securityAxes,performance,
    note:'Finite sampled security and timing observations. Source secrecy, functional cloning, runtime control, compatibility, and performance are independent requirements. The test does not establish a universal 2.5x bound.'
  };
}

/**
 * Execute existing adversarial controls and paired application profiles
 * sequentially to avoid corrupting timing evidence with parallel workloads.
 * @returns {Promise<ReturnType<typeof summarizeEvidence>>}
 */
async function run(){
  const coo=await runCooEvidence();
  const sno=await runSnoEvidence();
  const snoProfile=await profileSno(13);
  const worker=path.join(__dirname,'application-challenge-sco-cold-session.js');
  const {stdout}=await execFileAsync(process.execPath,[worker],{
    timeout:240000,maxBuffer:4*1024*1024
  });
  const prefix='APPLICATION_SCO_COLD_SESSION ';
  const line=stdout.split(/\r?\n/u).find(value=>value.startsWith(prefix));
  if(!line)throw new Error('SCO frozen-service evidence marker unavailable');
  const sco=JSON.parse(line.slice(prefix.length));
  const snoResident=await runSnoResidentEvidence(13);
  const summary=summarizeEvidence(coo,sno,snoProfile,sco,snoResident);
  process.stdout.write('CROSS_MODE_RELEASE_EVIDENCE '+JSON.stringify({
    node:process.version,platform:process.platform,summary
  })+'\n');
  return summary;
}

if(require.main===module)run().then(async summary=>{
  if(process.env.OBFS_RELEASE_AUDIT_FILE){
    await atomicWrite(process.env.OBFS_RELEASE_AUDIT_FILE,
      JSON.stringify({source:'sims/release-evidence-gate.js',
        node:process.version,platform:process.platform,summary},null,2)+'\n');
  }
}).catch(error=>{
  console.error(error);process.exitCode=1;
});

module.exports={run,summarizeEvidence,sampleVerdict};
