'use strict';

const assert=require('node:assert/strict');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {sample}=require('./sco-ratchet-worker-multi-principal');

/** @param {number[]} values @returns {number} */
function median(values){
  const copy=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(copy.length/2);
  return copy.length%2?copy[middle]:(copy[middle-1]+copy[middle])/2;
}

/**
 * Contrast generated-SCO and ordinary authenticated Node worker transport
 * under the same legitimate multi-A-account saturation challenge. The
 * same randomized private root is used within each freshly started pair;
 * each arm uses exactly the same worker HMAC, FIFO and HTTP cookie contract.
 *
 * @returns {Promise<object>}
 */
async function experiment(){
  /** @type {Array<{
   * aCount:number,trial:number,
   * generated:Awaited<ReturnType<typeof sample>>,
   * ordinary:Awaited<ReturnType<typeof sample>>,
   * generatedVsOrdinary:number
   * }>} */
  const rows=[];
  for(const count of [1,4,8]){
    for(let i=0;i<4;i++){
      const root=randomBytes(32);
      /** @type {Awaited<ReturnType<typeof sample>>} */
      let generated;
      /** @type {Awaited<ReturnType<typeof sample>>} */
      let ordinary;
      // Both modes occupy the first and second positions equally per count.
      if(i%2===0){
        generated=await sample(count,i,false,root);
        ordinary=await sample(count,i,true,root);
      }else{
        ordinary=await sample(count,i,true,root);
        generated=await sample(count,i,false,root);
      }
      for(const value of [generated,ordinary]){
        assert.equal(value.aCount,count);
        assert.equal(value.trial,i);
        assert.equal(value.workerCount,count+2);
        assert.equal(value.validAResponses,count);
        assert.equal(value.a0Overlap,true);
        assert.ok(value.a0PrivateMs>0);
        assert.ok(value.nativeBMs>0&&value.loadedBMs>0&&value.quietBMs>0);
      }
      rows.push({aCount:count,trial:i,generated,ordinary,
        generatedVsOrdinary:generated.loadedBMs/ordinary.loadedBMs});
    }
  }
  const populations=[1,4,8].map(count=>{
    const pairs=rows.filter(row=>row.aCount===count);
    assert.equal(pairs.length,4);
    return {
      attackerPrincipals:count,
      residentWorkerThreads:count+2,
      originalHmacEventsPerArm:count*64+32,
      freshSameRootAlternatingPairs:4,
      generatedStrictBOverBudget:pairs.filter(row=>row.generated.loadedRatio>2.5).length,
      ordinaryStrictBOverBudget:pairs.filter(row=>row.ordinary.loadedRatio>2.5).length,
      medianGeneratedVsOrdinaryLoadedB:median(pairs.map(row=>row.generatedVsOrdinary)),
      medianGeneratedLoadedBDirect:median(pairs.map(row=>row.generated.loadedRatio)),
      medianOrdinaryLoadedBDirect:median(pairs.map(row=>row.ordinary.loadedRatio)),
      maximumGeneratedLoadedBDirect:Math.max(...pairs.map(row=>row.generated.loadedRatio)),
      maximumOrdinaryLoadedBDirect:Math.max(...pairs.map(row=>row.ordinary.loadedRatio)),
      perPair:pairs.map(row=>({
        trial:row.trial+1,
        generatedLoadedBMs:Number(row.generated.loadedBMs.toFixed(5)),
        ordinaryLoadedBMs:Number(row.ordinary.loadedBMs.toFixed(5)),
        generatedQuietBMs:Number(row.generated.quietBMs.toFixed(5)),
        ordinaryQuietBMs:Number(row.ordinary.quietBMs.toFixed(5)),
        generatedNativeBMs:Number(row.generated.nativeBMs.toFixed(5)),
        ordinaryNativeBMs:Number(row.ordinary.nativeBMs.toFixed(5)),
        generatedBDirectRatio:Number(row.generated.loadedRatio.toFixed(5)),
        ordinaryBDirectRatio:Number(row.ordinary.loadedRatio.toFixed(5)),
        generatedVsOrdinaryRatio:Number(row.generatedVsOrdinary.toFixed(5)),
        generatedA0PrivateMs:Number(row.generated.a0PrivateMs.toFixed(5)),
        ordinaryA0PrivateMs:Number(row.ordinary.a0PrivateMs.toFixed(5)),
        verifiedA0Overlap:true,allNativeOutputsEqual:true,allHttp200:true
      }))
    };
  });
  return {
    experiment:'Same-root equal-trust SCO worker vs ordinary authenticated Node worker multi-account CPU saturation',
    platform:process.platform,node:process.version,
    availableParallelism:os.availableParallelism(),
    privateRootBytes:32,privateBytesPerEvent:8388608,
    samples:rows.length,threePopulations:[1,4,8],fourAlternatingPairsEach:true,
    genuineIndependentBSubmittedDuringA0PrivateWork:true,
    exactOriginalOutputAndAllValidHttp200:true,
    populations,
    caveat:'Multiple independently authorized A credentials are an extra conditional attacker assumption. This measures B loaded HTTP service latency under original CPU contention, not total CPU, TLS/WAN, browser, startup, memory quotas, static source secrecy, same-account relay or universal 2.5x compliance.'
  };
}

if(require.main===module){
  experiment().then(value=>process.stdout.write('SCO_WORKER_EQUAL_TRUST_SATURATION '+JSON.stringify(value)+'\n'),
    error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}

module.exports={experiment};
