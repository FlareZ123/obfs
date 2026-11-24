'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const {learnProjectedAffineOracle,evaluateProjectedAffineModel} =
  require('./projected-affine-coset-profile-clone');
const {
  cloneTopDerivativeProjectedAffine,
  evaluateHybridModel
} = require('./rankfive-top-derivative-projected-affine-hybrid-peer');
const {privateSource} = require('./sco-rankfive-arbitrary-table-real-http');
const {verifySourcePromise} = require('./sco-rankfive-top-quintic-real-http');

const MASKS = [0xc7639c15,0x32e67ad1,0xe5ab17c2,0x4692ed7f,0x1fa37cc9];

/** @param {number} seed @returns {()=>number} */
function seededWordGenerator(seed) {
  let counter = 0;
  return () => createHash('sha256')
    .update(String(seed) + ':' + counter++)
    .digest().readUInt32BE(0);
}

/** @param {number} x @returns {number} */
function parity32(x) {
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x ^= x >>> 2;
  x ^= x >>> 1;
  return x & 1;
}

/** @param {number[]} values @returns {number} */
function mean(values) {
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

/** @param {number[]} values @param {number} p @returns {number} */
function percentile(values,p) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
}

/** @param {number[]} values @returns {number} */
function median(values) {
  return percentile(values,0.5);
}

/** @returns {(input:number)=>number} */
function makeFrozenSourceOracle() {
  const table = Array.from({length:32},(_,index)=>
    createHash('sha256').update('private-table-rank5/'+index).digest().readUInt32BE(0));
  table[31]=(table[31]^0x9765c3af)>>>0;
  return input => {
    const x=input>>>0;
    const index=
      parity32(x&MASKS[0]) |
      (parity32(x&MASKS[1])<<1) |
      (parity32(x&MASKS[2])<<2) |
      (parity32(x&MASKS[3])<<3) |
      (parity32(x&MASKS[4])<<4);
    const affine=((x<<5)|(x>>>27))^((x<<13)|(x>>>19));
    return (affine^0x5a9bc7e1^table[index])>>>0;
  };
}

/**
 * Reproducible Monte Carlo query-count comparison using the exact frozen HTTP
 * source, with deterministic SHA-256 counter tapes. These tapes make the
 * simulation repeatable; they are not cryptographic evidence of independent
 * draws. The analytic learner bounds remain separate.
 */
async function main() {
  const replicates=1000;
  const source=privateSource();
  const sourcePromise=verifySourcePromise(source);
  const privateModule=await import('data:text/javascript,'+encodeURIComponent(source));
  const oracle=makeFrozenSourceOracle();

  // Verify that the synchronous simulation oracle is byte-for-byte equivalent
  // in behavior to the actual async ESM source used by the HTTP experiment.
  const equivalenceDraw=seededWordGenerator(0x50a2026f1);
  for(let i=0;i<1024;i++){
    const input=equivalenceDraw();
    assert.equal(oracle(input),await privateModule.protectedGenericFive(input));
  }

  /** @type {number[]} */
  const baselineQueries=[];
  /** @type {number[]} */
  const hybridQueries=[];
  /** @type {number[]} */
  const baselineAttempts=[];
  /** @type {number[]} */
  const hybridTrials=[];
  /** @type {number[]} */
  const pairedSavings=[];
  let hybridFallbacks=0;
  let baselineFailures=0;

  for(let replicate=0;replicate<replicates;replicate++){
    const baselineDraw=seededWordGenerator(0x51000000+replicate);
    const baseline=learnProjectedAffineOracle(oracle,32,5,baselineDraw,1e-10);
    baselineQueries.push(baseline.queries);
    baselineAttempts.push(baseline.attempts);
    if(!(baseline.failureBound<1e-10))baselineFailures++;

    const hybrid=cloneTopDerivativeProjectedAffine(
      oracle,32,
      seededWordGenerator(0x52000000+replicate),
      seededWordGenerator(0x53000000+replicate),
      1e-10
    );
    hybridQueries.push(hybrid.queries);
    hybridTrials.push(hybrid.diagnostics.witnessTrials);
    if(hybrid.diagnostics.fallbackUsed)hybridFallbacks++;

    const heldout=seededWordGenerator(0x54000000+replicate);
    for(let i=0;i<64;i++){
      const input=heldout();
      assert.equal(evaluateProjectedAffineModel(baseline,input),oracle(input),
        'existing projected-affine model failed an independent simulation holdout');
      assert.equal(evaluateHybridModel(hybrid.model,input),oracle(input),
        'top-derivative hybrid model failed an independent simulation holdout');
    }
    pairedSavings.push(baseline.queries-hybrid.queries);
  }

  const baselineMean=mean(baselineQueries);
  const hybridMean=mean(hybridQueries);
  const summary={
    replicates,
    sourceHash:sourcePromise.sourceHash,
    sourcePromise:{
      maskRank:sourcePromise.maskRank,
      tableTopCoefficient:'0x'+sourcePromise.tableTopCoefficient.toString(16)
    },
    baseline:{
      meanQueries:baselineMean,
      medianQueries:median(baselineQueries),
      p10Queries:percentile(baselineQueries,0.10),
      p90Queries:percentile(baselineQueries,0.90),
      p95Queries:percentile(baselineQueries,0.95),
      maxQueries:Math.max(...baselineQueries),
      meanAttempts:mean(baselineAttempts),
      failures:baselineFailures
    },
    hybrid:{
      meanQueries:hybridMean,
      medianQueries:median(hybridQueries),
      p10Queries:percentile(hybridQueries,0.10),
      p90Queries:percentile(hybridQueries,0.90),
      p95Queries:percentile(hybridQueries,0.95),
      maxQueries:Math.max(...hybridQueries),
      meanWitnessTrials:mean(hybridTrials),
      fallbacks:hybridFallbacks
    },
    paired:{
      meanQueriesSaved:mean(pairedSavings),
      medianQueriesSaved:median(pairedSavings),
      meanReductionPercent:100*(baselineMean-hybridMean)/baselineMean,
      fractionHybridLower:pairedSavings.filter(value=>value>0).length/replicates
    },
    drawMethod:'deterministic SHA-256 counter tapes; reproducible simulation only, not an independence proof',
    arrays:{baselineQueries,hybridQueries,baselineAttempts,hybridTrials,pairedSavings}
  };
  fs.writeFileSync(
    'rankfive-top-derivative-hybrid-query-simulation.json',
    JSON.stringify(summary,null,2)+'\n'
  );
  const compact={...summary};
  delete compact.arrays;
  console.log('RANKFIVE_TOP_DERIVATIVE_HYBRID_SIMULATION '+JSON.stringify(compact));
  return summary;
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main,makeFrozenSourceOracle};
