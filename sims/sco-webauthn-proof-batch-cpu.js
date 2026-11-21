'use strict';

const assert=require('node:assert/strict');
const os=require('node:os');
const {
  createSignedProofs,verifySignedProof,runBatch,profile
}=require('./sco-webauthn-proof-cpu-budget');

/**
 * Signed-verifier batching component-only screen.
 * @returns {{
 *   node:string,platform:string,cpuModel:string,
 *   limits:{browserSigningIncluded:boolean,challengeSerializationIncluded:boolean},
 *   profiles:ReturnType<typeof profile>[],
 *   placebo:{samples:{firstCpuUs:number,secondCpuUs:number}[],
 *     pairedRatios:number[],strictBreachesOver2_5x:number,
 *     maxPairRatio:number}
 * }}
 */
function runBatchedBudgetProbe(){
  const fixtures=createSignedProofs();
  for(const proof of fixtures)assert.ok(verifySignedProof(proof));
  runBatch(500,4000,false,fixtures,1);
  runBatch(500,4000,true,fixtures,1,32);
  const results=[
    profile('small-batch-32',500,4000,fixtures,32,32),
    profile('small-batch-128',500,4000,fixtures,32,128)
  ];
  /** @type {{firstCpuUs:number,secondCpuUs:number}[]} */
  const placeboSamples=[];
  for(let index=0;index<7;index++){
    const first=runBatch(500,4000,false,fixtures,32);
    const second=runBatch(500,4000,false,fixtures,32);
    assert.equal(first.checksum,second.checksum);
    assert.ok(first.cpuUs>0&&second.cpuUs>0);
    placeboSamples.push({firstCpuUs:first.cpuUs,secondCpuUs:second.cpuUs});
  }
  const placeboRatios=placeboSamples.map(pair=>
    pair.secondCpuUs/pair.firstCpuUs);
  return {
    node:process.version,platform:process.platform,
    cpuModel:os.cpus()[0]?.model??'unknown',
    limits:{browserSigningIncluded:false,challengeSerializationIncluded:false},
    profiles:results,
    placebo:{
      samples:placeboSamples,
      pairedRatios:placeboRatios,
      strictBreachesOver2_5x:placeboRatios.filter(ratio=>ratio>2.5).length,
      maxPairRatio:Math.max(...placeboRatios)
    }
  };
}

if(require.main===module){
  process.stdout.write('SCO_WEBAUTHN_BATCH_CPU '+JSON.stringify(runBatchedBudgetProbe())+'\n');
}

module.exports={runBatchedBudgetProbe};
