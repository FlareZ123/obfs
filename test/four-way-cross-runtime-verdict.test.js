'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {evaluateFourWayCrossRuntime}=require('../sims/four-way-cross-runtime-verdict');

/** @returns {Parameters<typeof evaluateFourWayCrossRuntime>} */
function example(){
  const hashes={
    native:'a'.repeat(64),minified:'b'.repeat(64),
    published:'c'.repeat(64),reconstructed:'d'.repeat(64)
  };
  const node={
    sha256:hashes,protectedFunctions:3,
    minifiedStaticRecovery:{recovered:3},
    publishedStaticRecovery:{recovered:3,comparisons:12288},
    matchedStaticDecision:{attackAdvantage:/** @type {const} */('contradicted'),measurementReady:true},
    candidateDecision:{attackAdvantage:/** @type {const} */('contradicted')},
    rows:[1,50,1000,10000].map(events=>({
      events,timingMs:{
        native:Array(13).fill(1),minified:Array(13).fill(1.1),
        published:Array(13).fill(1.3),reconstructed:Array(13).fill(1.1)
      }
    }))
  };
  const browser={
    sourceSha256:{...hashes},clockProbeMs:30,
    verifiedFullOutputs:true,verifiedExternalCallbacks:true,
    matchedWorkloads:4,pairedHotWorkEvents:10000,
    freshGraphHttpModuleRequests:288,
    samples:{
      native:Array(13).fill(1),minified:Array(13).fill(1),
      published:Array(13).fill(1.3),reconstructed:Array(13).fill(1)
    },
    coldFreshGraphs:{
      '10000':{computeMs:{
        native:Array(13).fill(4),minified:Array(13).fill(4),
        published:Array(13).fill(5),reconstructed:Array(13).fill(4)
      }}
    }
  };
  return [node,browser];
}

test('matched real-clock node and browser evidence preserves static reconstruction veto',()=>{
  const [node,browser]=example();
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.sourceHashesMatch,true);
  assert.equal(verdict.familywise.comparisons,6);
  assert.equal(verdict.strictComputeBudget,'sample-supported');
  assert.equal(verdict.familywise.observedOverBudgetPairs,0);
  assert.equal(verdict.staticAttackerVerdict,'reconstructed');
  assert.equal(verdict.candidateChoice,'reject');
  assert.equal(verdict.releaseVerdict,'RELEASE-BLOCKED');
  assert.deepEqual(verdict.matchedSampleBoundaries,[
    'node-fresh-session-1','node-fresh-session-50',
    'node-fresh-session-1000','node-fresh-session-10000',
    'chromium-warmed-10000-compute','chromium-fresh-10000-compute'
  ]);
});

test('two warm browser CPU breaches veto medians that remain within 2.5x',()=>{
  const [node,browser]=example();
  browser.samples.published[1]=2.6;
  browser.samples.published[5]=2.8;
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.familywise.observedOverBudgetPairs,2);
  assert.equal(verdict.strictComputeBudget,'sample-breached');
  assert.equal(verdict.releaseVerdict,'RELEASE-BLOCKED');
  assert.ok(verdict.familywise.rows[4].medianOfPairedRatios<2.5);
});

test('browser cold CPU breach is counted independently of import latency',()=>{
  const [node,browser]=example();
  browser.coldFreshGraphs['10000'].computeMs.published[0]=11;
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.familywise.observedOverBudgetPairs,1);
  assert.equal(verdict.strictComputeBudget,'sample-breached');
});

test('a slow module fetch alone is not misidentified as measured JavaScript CPU',()=>{
  const [node,browser]=example();
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.strictComputeBudget,'sample-supported');
  assert.match(verdict.caveat,/excludes HTTP\/import latency/u);
});

test('unmatched source hashes cannot be pooled into one release decision',()=>{
  const [node,browser]=example();
  browser.sourceSha256.published='f'.repeat(64);
  assert.throws(()=>evaluateFourWayCrossRuntime(node,browser),
    /graph SHA-256 mismatch: published/u);
});

test('virtual or frozen browser clock and missing observable state are refused',()=>{
  const [node,browser]=example();
  browser.clockProbeMs=0;
  assert.throws(()=>evaluateFourWayCrossRuntime(node,browser),/real-clock/u);
  browser.clockProbeMs=30;
  browser.verifiedExternalCallbacks=false;
  assert.throws(()=>evaluateFourWayCrossRuntime(node,browser),/Chromium trace/u);
});

test('missing full dependency load or sampled work dimension cannot pass',()=>{
  const [node,browser]=example();
  browser.freshGraphHttpModuleRequests=287;
  assert.throws(()=>evaluateFourWayCrossRuntime(node,browser),/module-graph witness/u);
  browser.freshGraphHttpModuleRequests=288;
  browser.coldFreshGraphs={};
  assert.throws(()=>evaluateFourWayCrossRuntime(node,browser),/fresh Chromium/u);
});

test('absent independent attacker recovery remains inconclusive even with low CPU',()=>{
  const [node,browser]=example();
  node.publishedStaticRecovery.recovered=1;
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.staticAttackerVerdict,'inconclusive');
  assert.equal(verdict.candidateChoice,'inconclusive');
  assert.equal(verdict.releaseVerdict,'RESEARCH-INCONCLUSIVE');
});

test('a nondecisive zero-query static recovery cannot certify reconstruction',()=>{
  const [node,browser]=example();
  node.matchedStaticDecision.attackAdvantage='inconclusive';
  const report=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(report.staticAttackerVerdict,'inconclusive');
  assert.equal(report.candidateChoice,'inconclusive');
  assert.equal(report.releaseVerdict,'RESEARCH-INCONCLUSIVE');
});

test('missing or too-small static held-out verification cannot pass the join',()=>{
  const [node,browser]=example();
  node.publishedStaticRecovery.comparisons=3;
  assert.equal(evaluateFourWayCrossRuntime(node,browser).staticAttackerVerdict,
    'inconclusive');
  node.publishedStaticRecovery.comparisons=12288;
  node.matchedStaticDecision.measurementReady=false;
  assert.equal(evaluateFourWayCrossRuntime(node,browser).staticAttackerVerdict,
    'inconclusive');
});

test('strict budget breach in a Node short session remains visible',()=>{
  const [node,browser]=example();
  node.rows[0].timingMs.published[0]=4;
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  assert.equal(verdict.strictComputeBudget,'sample-breached');
  assert.equal(verdict.familywise.observedOverBudgetPairs,1);
  assert.equal(verdict.releaseVerdict,'RELEASE-BLOCKED');
});
