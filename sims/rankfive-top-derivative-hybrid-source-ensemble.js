'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const {learnProjectedAffineOracle,evaluateProjectedAffineModel} =
  require('./projected-affine-coset-profile-clone');
const {
  cloneTopDerivativeProjectedAffine,
  evaluateHybridModel,
  makeRankFiveSource
}=require('./rankfive-top-derivative-projected-affine-hybrid-peer');

/** @param {number} seed @returns {()=>number} */
function seededWordGenerator(seed){
  let counter=0;
  return ()=>createHash('sha256')
    .update(String(seed)+':'+counter++)
    .digest().readUInt32BE(0);
}

/** @param {number[]} values @returns {number} */
function mean(values){
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

/** @param {number[]} values @param {number} p @returns {number} */
function percentile(values,p){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2===0?(sorted[middle-1]+sorted[middle])/2:sorted[middle];
}

/**
 * Paired Monte Carlo over many independently generated rank-five projected
 * tables. Each source has five independent parity masks and a nonzero top
 * table coefficient. Deterministic counter tapes preserve reproducibility.
 */
function main(){
  const sourceCount=50;
  const replicatesPerSource=20;
  const totalReplicates=sourceCount*replicatesPerSource;
  /** @type {number[]} */
  const baselineQueries=[];
  /** @type {number[]} */
  const hybridQueries=[];
  /** @type {number[]} */
  const savings=[];
  /** @type {Array<{source:number,baselineMean:number,hybridMean:number,saving:number,hybridLower:boolean}>} */
  const sourceSummaries=[];
  let fallbacks=0;
  let holdoutChecks=0;

  for(let sourceIndex=0;sourceIndex<sourceCount;sourceIndex++){
    const source=makeRankFiveSource(32,seededWordGenerator(0x60000000+sourceIndex));
    /** @type {number[]} */
    const sourceBaseline=[];
    /** @type {number[]} */
    const sourceHybrid=[];
    for(let replicate=0;replicate<replicatesPerSource;replicate++){
      const seed=sourceIndex*replicatesPerSource+replicate;
      const baseline=learnProjectedAffineOracle(
        source,32,5,seededWordGenerator(0x61000000+seed),1e-10
      );
      assert.ok(baseline.failureBound<1e-10);
      const hybrid=cloneTopDerivativeProjectedAffine(
        source,32,
        seededWordGenerator(0x62000000+seed),
        seededWordGenerator(0x63000000+seed),
        1e-10
      );
      assert.equal(hybrid.diagnostics.fastPathSuccess,true);
      assert.equal(hybrid.diagnostics.fallbackUsed,false);
      assert.equal(hybrid.diagnostics.quotientRank,5);
      const heldout=seededWordGenerator(0x64000000+seed);
      for(let i=0;i<32;i++){
        const input=heldout();
        assert.equal(evaluateProjectedAffineModel(baseline,input),source(input));
        assert.equal(evaluateHybridModel(hybrid.model,input),source(input));
        holdoutChecks+=2;
      }
      baselineQueries.push(baseline.queries);
      hybridQueries.push(hybrid.queries);
      savings.push(baseline.queries-hybrid.queries);
      sourceBaseline.push(baseline.queries);
      sourceHybrid.push(hybrid.queries);
      if(hybrid.diagnostics.fallbackUsed)fallbacks++;
    }
    const baselineMean=mean(sourceBaseline);
    const hybridMean=mean(sourceHybrid);
    sourceSummaries.push({
      source:sourceIndex,
      baselineMean,
      hybridMean,
      saving:baselineMean-hybridMean,
      hybridLower:hybridMean<baselineMean
    });
  }

  const baselineMean=mean(baselineQueries);
  const hybridMean=mean(hybridQueries);
  const summary={
    sourceCount,
    replicatesPerSource,
    totalReplicates,
    sourceFamily:'F(x)=L(x) XOR h(Px), rank(P)=5, 32-bit output, nonzero degree-five table coefficient',
    baseline:{
      meanQueries:baselineMean,
      medianQueries:median(baselineQueries),
      p10Queries:percentile(baselineQueries,0.10),
      p90Queries:percentile(baselineQueries,0.90),
      p95Queries:percentile(baselineQueries,0.95),
      maxQueries:Math.max(...baselineQueries)
    },
    hybrid:{
      meanQueries:hybridMean,
      medianQueries:median(hybridQueries),
      p10Queries:percentile(hybridQueries,0.10),
      p90Queries:percentile(hybridQueries,0.90),
      p95Queries:percentile(hybridQueries,0.95),
      maxQueries:Math.max(...hybridQueries),
      fallbacks
    },
    paired:{
      meanQueriesSaved:mean(savings),
      medianQueriesSaved:median(savings),
      meanReductionPercent:100*(baselineMean-hybridMean)/baselineMean,
      fractionHybridLower:savings.filter(value=>value>0).length/totalReplicates
    },
    acrossSources:{
      sourcesHybridLower:sourceSummaries.filter(item=>item.hybridLower).length,
      minSourceMeanSaving:Math.min(...sourceSummaries.map(item=>item.saving)),
      maxSourceMeanSaving:Math.max(...sourceSummaries.map(item=>item.saving)),
      sourceSummaries
    },
    holdoutChecks,
    drawMethod:'deterministic SHA-256 counter tapes; reproducible simulation, not proof of independent uniform draws',
    arrays:{baselineQueries,hybridQueries,savings}
  };
  fs.writeFileSync('rankfive-top-derivative-hybrid-source-ensemble.json',JSON.stringify(summary,null,2)+'\n');
  const {arrays:unusedArrays,acrossSources:unusedSourceSummaries,...compact}=summary;
  void unusedArrays;
  void unusedSourceSummaries;
  console.log('RANKFIVE_TOP_DERIVATIVE_HYBRID_SOURCE_ENSEMBLE '+JSON.stringify(compact));
  return summary;
}

if(require.main===module)main();
module.exports={main};
