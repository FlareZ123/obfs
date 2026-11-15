'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoBatchMethod,preflightScoBatchState}=require('../src');

/** @typedef {{method:string,args:unknown[]}} Call */

/**
 * @param {number} iterations
 * @param {boolean} predictive
 * @param {boolean} [isolated]
 * @returns {import('node:http').Server}
 */
function makeServer(iterations,predictive,isolated=false) {
  const operations={
    /** @param {number} seed @returns {number} */
    work:seed=>{
      let x=seed|0;
      for(let i=0;i<iterations;i++) {
        x=(Math.imul(x^i,1664525)+1013904223)|0;
      }
      return x;
    }
  };
  const batch=createScoBatchMethod(operations);
  let tail=Promise.resolve();
  /**
   * Hold an application lock until coarse authorization, the full batch,
   * and response writing have finished. The timing fixture uses a global
   * lock so its uncongested cost is independently reproducible.
   * @param {import('node:http').IncomingMessage} request
   * @param {()=>Promise<void>} execute
   * @returns {Promise<void>}
   */
  async function runRpcIsolated(request,execute) {
    const previous=tail;
    /** @type {()=>void} */
    let unlock=()=>{};
    tail=new Promise(resolve=>{unlock=()=>resolve();});
    await previous;
    try{
      await execute();
    }finally{
      unlock();
    }
  }
  const policy={
    /** @param {boolean} active @param {string} method @param {unknown[]} args */
    authorize:(active,method,args)=>active && method==='work' &&
      args.length===1 && Number.isSafeInteger(args[0]),
    /** @param {boolean} active */
    transition:active=>active
  };
  return http.createServer(createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      if(method==='batch') {
        if(args.length!==1||!Array.isArray(args[0]))return false;
        return !predictive || preflightScoBatchState(args[0],true,policy);
      }
      return policy.authorize(true,method,args);
    },
    ...(isolated?{runRpcIsolated}:{})
  }));
}

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * Send authenticated-by-fixture RPC requests in series, including transport,
 * serialization, policy checks, CPU work and response decoding in the timer.
 * @param {number} port
 * @param {Call[]} calls
 * @param {number} repetitions
 * @returns {Promise<{ms:number,checksum:number}>}
 */
async function runRequests(port,calls,repetitions) {
  const endpoint='http://127.0.0.1:'+port+'/obfs/rpc';
  const body=JSON.stringify({method:'batch',args:[calls]});
  let checksum=0;
  const start=performance.now();
  for(let i=0;i<repetitions;i++) {
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body
    });
    assert.equal(response.status,200);
    const parsed=await response.json();
    assert.equal(parsed.ok,true);
    assert.equal(parsed.value.length,calls.length);
    for(const item of parsed.value) {
      assert.equal(item.ok,true);
      checksum=(checksum+item.value)|0;
    }
  }
  return {ms:performance.now()-start,checksum};
}

/** @param {number[]} data @returns {number} */
function median(data) {
  const sorted=[...data].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {number} iterations
 * @returns {Promise<object>}
 */
async function benchmark(iterations) {
  const servers=[
    makeServer(iterations,false),
    makeServer(iterations,true),
    makeServer(iterations,true,true)
  ];
  const ports=await Promise.all(servers.map(server=>listen(server)));
  /** @type {Call[]} */
  const calls=Array.from({length:32},(_,i)=>({method:'work',args:[i+1]}));
  const names=/** @type {('plain'|'predicted'|'isolated')[]} */ (['plain','predicted','isolated']);
  const samples={
    plain:/** @type {number[]} */ ([]),
    predicted:/** @type {number[]} */ ([]),
    isolated:/** @type {number[]} */ ([])
  };
  try{
    for(const port of ports)await runRequests(port,calls,25);
    for(let t=0;t<9;t++) {
      const sequence=[t%3,(t+1)%3,(t+2)%3];
      /** @type {number|null} */
      let expected=null;
      for(const index of sequence) {
        const trial=await runRequests(ports[index],calls,35);
        if(expected!==null)assert.equal(trial.checksum,expected);
        expected=trial.checksum;
        samples[names[index]].push(trial.ms/35);
      }
    }
  }finally{
    await Promise.all(servers.map(server=>close(server)));
  }
  const plainMs=median(samples.plain);
  const predictedMs=median(samples.predicted);
  const isolatedMs=median(samples.isolated);
  return {
    iterationsPerMethod:iterations,
    callsPerBatch:calls.length,
    trialsPerCandidate:samples.plain.length,
    requestsPerTrial:35,
    loopbackPlainMedianMs:Number(plainMs.toFixed(6)),
    loopbackPredictiveMedianMs:Number(predictedMs.toFixed(6)),
    loopbackIsolatedMedianMs:Number(isolatedMs.toFixed(6)),
    predictiveOverheadRatio:Number((predictedMs/plainMs).toFixed(6)),
    isolationOverPredictiveRatio:Number((isolatedMs/predictedMs).toFixed(6)),
    isolationOverPlainRatio:Number((isolatedMs/plainMs).toFixed(6)),
    rawPerTrialMs:samples
  };
}

/** @returns {Promise<void>} */
async function main(){
  const samples=[];
  for(const work of [512,8192])samples.push(await benchmark(work));
  console.log(JSON.stringify({
    node:process.version,
    platform:process.platform,
    architecture:process.arch,
    policy:'32-call immutable authorization trace',
    network:'127.0.0.1 HTTP without application TLS/authentication',
    samples
  },null,2));
}

if(require.main===module) {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={benchmark};
