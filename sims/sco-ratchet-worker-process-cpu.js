'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeServer}=require('./sco-ratchet-batch-candidate');
const {makeWorkerServer,post}=require('./sco-ratchet-worker-http-contention');

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update('process-cpu/'+label+'/'+index).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const copy=[...values].sort((a,b)=>a-b);
  return copy[Math.floor(copy.length/2)];
}

/**
 * Add user+system process CPU microseconds, across Node's worker threads.
 * Node's public process.cpuUsage reports process-wide user/system usage,
 * which may exceed elapsed time across multiple CPU cores.
 * @param {{user:number,system:number}} usage
 * @returns {number}
 */
function totalCpu(usage){return usage.user+usage.system;}

/**
 * One 64A/16B original-equivalent HTTP CPU sample, excluding trusted server
 * worker initialization while including actual request, JSON and client fetch.
 * @param {'generated'|'worker'|'ordinary-worker'} mode
 * @param {Buffer} root
 * @param {number} trial
 */
async function sample(mode,root,trial){
  const machine=createPrivateMachine(root);
  const aPrincipal='cpu-A/'+trial,bPrincipal='cpu-B/'+trial;
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const workerBackend=mode==='worker'||mode==='ordinary-worker'?
    makeWorkerServer(root,()=>null,mode==='ordinary-worker'):null;
  const backend=workerBackend??makeServer(root,0);
  backend.grant(tokenA,aPrincipal);
  backend.grant(tokenB,bPrincipal);
  await workerBackend?.ready();
  const server=http.createServer(backend.handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  try{
    const aInputs=Array.from({length:64},(_,i)=>challenge('A',i));
    const bInputs=Array.from({length:16},(_,i)=>challenge('B',i));
    const originalStart=process.cpuUsage();
    const expectedA=aInputs.map((value,i)=>machine.advance(aPrincipal,i,value));
    const expectedB=bInputs.map((value,i)=>machine.advance(bPrincipal,i,value));
    const originalUsage=process.cpuUsage(originalStart);
    const originalCpuUs=totalCpu(originalUsage);
    assert.ok(originalCpuUs>0);
    const protectedStart=process.cpuUsage();
    const [a,b]=await Promise.all([
      post(base,tokenA,aInputs),
      post(base,tokenB,bInputs)
    ]);
    const protectedUsage=process.cpuUsage(protectedStart);
    const protectedCpuUs=totalCpu(protectedUsage);
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    assert.deepEqual(a.value,expectedA);
    assert.deepEqual(b.value,expectedB);
    assert.equal(backend.calls(),80);
    return {mode,trial,rootBytes:root.length,originalCpuUs,protectedCpuUs,
      originalUserUs:originalUsage.user,originalSystemUs:originalUsage.system,
      protectedUserUs:protectedUsage.user,protectedSystemUs:protectedUsage.system,
      ratio:protectedCpuUs/originalCpuUs,allOutputsEqual:true};
  }finally{
    server.closeAllConnections();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
    await workerBackend?.shutdown();
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  /** @type {Array<Awaited<ReturnType<typeof sample>>>} */
  const sync=[];
  /** @type {Array<Awaited<ReturnType<typeof sample>>>} */
  const worker=[];
  /** @type {Array<Awaited<ReturnType<typeof sample>>>} */
  const ordinary=[];
  /** @type {Array<Array<'generated'|'worker'|'ordinary-worker'>>} */
  const orders=[
    ['generated','worker','ordinary-worker'],
    ['worker','ordinary-worker','generated'],
    ['ordinary-worker','generated','worker'],
    ['generated','ordinary-worker','worker'],
    ['ordinary-worker','worker','generated'],
    ['worker','generated','ordinary-worker']
  ];
  for(let trial=0;trial<7;trial++){
    const root=randomBytes(32);
    for(const mode of orders[trial%orders.length]){
      const result=await sample(mode,root,trial);
      if(mode==='generated')sync.push(result);
      else if(mode==='worker')worker.push(result);
      else ordinary.push(result);
    }
  }
  assert.equal(sync.length,7);
  assert.equal(worker.length,7);
  assert.equal(ordinary.length,7);
  const byMode=[sync,worker,ordinary].map(rows=>({
    mode:rows[0].mode,trials:rows.length,
    medianCpuRatio:median(rows.map(x=>x.ratio)),
    maximumCpuRatio:Math.max(...rows.map(x=>x.ratio)),
    overBudgetPairs:rows.filter(x=>x.ratio>2.5).length,
    samples:rows.map(x=>({
      trial:x.trial,originalCpuUs:x.originalCpuUs,protectedCpuUs:x.protectedCpuUs,
      originalUserUs:x.originalUserUs,originalSystemUs:x.originalSystemUs,
      protectedUserUs:x.protectedUserUs,protectedSystemUs:x.protectedSystemUs,
      ratio:Number(x.ratio.toFixed(5))
    }))
  }));
  const pairs=sync.map((row,i)=>({
    trial:i+1,
    workerVsSyncCpuRatio:worker[i].ratio/row.ratio,
    generatedWorkerVsOrdinaryWorkerCpuRatio:worker[i].ratio/ordinary[i].ratio,
    generatedWorkerVsOrdinaryProtectedCpuRatio:worker[i].protectedCpuUs/ordinary[i].protectedCpuUs
  }));
  return {
    experiment:'Node process user+system CPU original 80-event HMAC versus generated synchronous/worker and same-trust ordinary worker HTTP',
    platform:process.platform,node:process.version,
    originalEventsPerTrial:80,privateBytesPerEvent:8388608,
    actualOriginalParity:true,
    cpuIncludesNodeProcessThreads:true,
    sameOriginalAndPrivateRootWithinAllThreeArms:true,
    sixPermutationOrderRepeatedAcrossSevenPairs:true,
    populations:byMode,
    medianWorkerVsSyncCpuRatio:median(pairs.map(x=>x.workerVsSyncCpuRatio)),
    medianGeneratedWorkerVsOrdinaryWorkerNormalizedCpuRatio:median(
      pairs.map(x=>x.generatedWorkerVsOrdinaryWorkerCpuRatio)),
    maximumGeneratedWorkerVsOrdinaryWorkerNormalizedCpuRatio:Math.max(
      ...pairs.map(x=>x.generatedWorkerVsOrdinaryWorkerCpuRatio)),
    medianGeneratedWorkerVsOrdinaryWorkerProtectedCpuRatio:median(
      pairs.map(x=>x.generatedWorkerVsOrdinaryProtectedCpuRatio)),
    pairedRelativeRatios:pairs,
    caveat:'Original 80-event direct HMAC and protected 80-event real HTTP/worker execute in the same Node process, with process-wide user+system CPU including worker threads, local fetch and JSON. Resident worker startup excluded. No browser/TLS/WAN, separate child CPU, independent B-during-A fairness, multi-principal saturation, security advantage, or universal 2.5x guarantee.'
  };
}

if(require.main===module){
  experiment().then(value=>process.stdout.write('SCO_WORKER_PROCESS_CPU '+JSON.stringify(value)+'\n'),
    error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={experiment};
