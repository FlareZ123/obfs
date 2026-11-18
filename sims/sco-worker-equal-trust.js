'use strict';

const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {experiment}=require('./sco-ratchet-worker-http-contention');

/** @param {number[]} values @returns {number} */
function median(values){
  const copy=[...values].sort((a,b)=>a-b);
  return copy[Math.floor(copy.length/2)];
}

/**
 * An equal-trust comparison: both endpoints hold the identical private 256-bit
 * original root and use prestarted per-principal Node worker threads, FIFO
 * isolation, the same authenticated cookie, the same 64A/16B JSON batches,
 * and a genuine independent B process submitting during A's private work.
 * One endpoint uses the generated SCO handler. The other is ordinary Node
 * HTTP and never publishes or invokes a generated client facade.
 *
 * Each pair runs against fresh servers and a newly generated shared root.
 * Arm order alternates to reduce systematic warm-up/order bias. Timings are
 * source-observations, not a strict global CPU theorem or security proof.
 *
 * @param {number} [pairs]
 * @returns {Promise<object>}
 */
async function compare(pairs=7){
  assert.ok(Number.isSafeInteger(pairs)&&pairs>=1&&pairs<=20);
  /** @type {Array<{
   *  trial:number,generatedLoadedBMs:number,ordinaryLoadedBMs:number,
   *  generatedQuietBMs:number,ordinaryQuietBMs:number,
   *  ratio:number,generatedOverBudget:boolean,ordinaryOverBudget:boolean,
   *  generatedNativeBMs:number,ordinaryNativeBMs:number
   * }>} */
  const rows=[];
  for(let i=0;i<pairs;i++){
    const root=randomBytes(32);
    const order=i%2===0?['worker','ordinary-worker']:['ordinary-worker','worker'];
    /** @type {Record<string,Awaited<ReturnType<typeof experiment>>>} */
    const arms=Object.create(null);
    for(const mode of order){
      arms[mode]=await experiment(
        /** @type {'worker'|'ordinary-worker'} */ (mode),1,i,root
      );
    }
    const generated=arms.worker;
    const ordinary=arms['ordinary-worker'];
    for(const arm of [generated,ordinary]){
      assert.equal(arm.statusCodesAll200,true);
      assert.equal(arm.independentChildProcess,true);
      assert.equal(arm.overlappingBSubmissions,1);
      assert.equal(arm.totalActualPrivateEvents,112);
      assert.equal(arm.samples.length,1);
      assert.equal(arm.samples[0].overlappingBSubmission,true);
    }
    const g=generated.samples[0],c=ordinary.samples[0];
    rows.push({
      trial:i+1,generatedLoadedBMs:g.loadedBMs,ordinaryLoadedBMs:c.loadedBMs,
      generatedQuietBMs:g.matchedQuietBMs,ordinaryQuietBMs:c.matchedQuietBMs,
      ratio:g.loadedBMs/c.loadedBMs,
      generatedOverBudget:g.loadedRatio>2.5,ordinaryOverBudget:c.loadedRatio>2.5,
      generatedNativeBMs:g.nativeBMs,ordinaryNativeBMs:c.nativeBMs
    });
  }
  return {
    experiment:'Equal-trust generated SCO versus ordinary authenticated Node HTTP, both using identical private worker threads',
    platform:process.platform,node:process.version,
    pairs,hashRootBytes:32,privateWorkBytesPerEvent:8388608,
    attackerEventsPerArm:64,victimEventsPerArm:16,
    observedBSubmissionInsideAPrivateExecution:true,
    independentBProcess:true,exactNativeOutputsAndHttp200:true,
    medianGeneratedVsOrdinaryLoadedB:median(rows.map(x=>x.ratio)),
    generatedStrictLoadedBOverBudget:rows.filter(x=>x.generatedOverBudget).length,
    ordinaryStrictLoadedBOverBudget:rows.filter(x=>x.ordinaryOverBudget).length,
    maximumGeneratedVsOrdinaryLoadedB:Math.max(...rows.map(x=>x.ratio)),
    samples:rows.map(row=>({
      ...row,
      ratio:Number(row.ratio.toFixed(5)),
      generatedLoadedBMs:Number(row.generatedLoadedBMs.toFixed(5)),
      ordinaryLoadedBMs:Number(row.ordinaryLoadedBMs.toFixed(5)),
      generatedQuietBMs:Number(row.generatedQuietBMs.toFixed(5)),
      ordinaryQuietBMs:Number(row.ordinaryQuietBMs.toFixed(5)),
      generatedNativeBMs:Number(row.generatedNativeBMs.toFixed(5)),
      ordinaryNativeBMs:Number(row.ordinaryNativeBMs.toFixed(5))
    })),
    scope:'Seven alternating same-secret fresh-server localhost pairs by default; the comparison measures B HTTP service latency under a single legal A burst, not sum of CPU, TLS, WAN, startup, public-source reconstruction, multi-principal saturation, or universal 2.5x compliance.'
  };
}

if(require.main===module){
  compare().then(value=>process.stdout.write('SCO_WORKER_EQUAL_TRUST '+JSON.stringify(value)+'\n'),
    error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={compare};
