'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {familywiseBudgetBounds}=require('./familywise-budget-bound');
const {runEvidence:runCooEvidence}=require('./polyvariant-app-three-way-budget');
const {runEvidence:runSnoEvidence,profile:profileSno}=require('./polyvariant-app-sno');

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
 * @returns {object}
 */
function summarizeEvidence(coo,sno,snoProfile,sco){
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
  // Ten simultaneous COO/SNO/SCO workload populations. Every dimension
  // exposes raw paired samples; preserve the original six COO/SCO controls
  // and include four process-level SNO controls without claiming a universal
  // runtime bound. Bonferroni adjusts both interval tails across ten rows.
  const familywise=familywiseBudgetBounds([
    ...cooBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.published})),
    ...snoBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.sno})),
    ...scoBudget.map(row=>({native:row.rawTimingMs.native,
      candidate:row.rawTimingMs.remote}))
  ]);
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
      confidenceRequested:familywise.confidenceRequested,
      confidenceAttainedAtLeast:familywise.familywiseCoverageAtLeast,
      perTailConfidenceRequested:familywise.perTailConfidenceRequested,
      comparisons:familywise.comparisons,
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
      boundary:'Ten measured paired COO/SNO/SCO populations. COO reuses one Node process with fresh ESM graph; SNO uses fresh child processes; SCO fresh client over localhost. Independent representative samples within each workload remain an assumption.'
    },
    coo:{verdict:sampleVerdict(cooBudget.map(row=>({
      decision:row.oneSidedMedianDecision}))),rows:cooBudget,
      boundary:'module graph loaded anew per trial; Node process reused'},
    sno:{verdict:sampleVerdict(snoBudget.map(row=>({
      decision:row.oneSidedMedianDecision
    }))),rows:snoBudget,
      descriptiveOverBudgetEvents:snoBudget.filter(row=>
        row.ratioOfMedians>2.5).map(row=>row.events),
      boundary:'fresh Node child process per paired sample; one-sided bounds concern population median of paired ratios, not all sessions'},
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
  const summary=summarizeEvidence(coo,sno,snoProfile,sco);
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
