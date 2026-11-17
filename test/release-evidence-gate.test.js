'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {sampleVerdict,summarizeEvidence}=require('../sims/release-evidence-gate');

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
        samplePairs:9
      },
      ratioReconstructedToPublishedMedians:0.9
    }))
  };
  const sno={
    selectedFunctions:3,staticComparisons:12288,offlineClone:true,
    staticRecovered:3,runtimeHooked:true,directEsmClone:true,
    manifestForged:true,runtimeDiskMutations:0
  };
  const snoProfile=[1,50,1000,10000].map(events=>({
    events,ratio:events===1?3.5:1.2
  }));
  const sco={
    semanticsPreserved:true,
    light:{count:1,ratio:4.2,pairedMedianBound:{decision:'exceeded'}},
    heavy:{count:120000,ratio:2.1,pairedMedianBound:{decision:'supported'}},
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
  assert.equal(summary.performance.sno.verdict,'sample-inconclusive');
  assert.equal(summary.performance.sco.verdict,'sample-exceeded');
  assert.equal(summary.performance.coo.rows.length,4);
  assert.equal(summary.performance.sno.rows.length,4);
  assert.equal(summary.performance.sco.rows.length,2);
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
