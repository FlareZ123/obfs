'use strict';

const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoBatchMethod}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Deterministic CPU work, deliberately independent of I/O and serialization.
 * @param {number} iterations
 * @returns {number}
 */
function compute(iterations) {
  let value=2166136261;
  for(let i=0;i<iterations;i++) value=Math.imul(value^(i&255),16777619)>>>0;
  return value;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}

/**
 * Measure one synchronous local function against the matching authenticated
 * SCO JSON RPC. The handler runs in the same Node process on loopback; real
 * cross-machine RTT is at least an additional variable.
 * @param {number} port
 * @param {number} iterations
 * @param {number} rounds
 * @param {number} calls
 * @returns {Promise<object>}
 */
async function measure(port,iterations,rounds,calls) {
  const url='http://127.0.0.1:'+port+'/obfs/rpc';
  /** @param {number} size @returns {Promise<number>} */
  async function remote(size) {
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'compute',args:[size]})});
    const data=await response.json();
    if (!response.ok || !data.ok) throw new Error('RPC failed during benchmark');
    return data.value;
  }
  /** @returns {Promise<number[]>} */
  async function remoteAsOneBatch() {
    const callsList=Array.from({length:calls},(_,index)=>({
      method:'compute',args:[iterations+(index%7)]
    }));
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'batch',args:[callsList]})});
    const data=await response.json();
    if(!response.ok || !data.ok || !Array.isArray(data.value) ||
       data.value.some(item=>!item.ok)) {
      throw new Error('Batched RPC failed during benchmark');
    }
    return data.value.map(item=>item.value);
  }
  for(let warm=0;warm<6;warm++) {
    compute(iterations+warm);
    assert.equal(await remote(iterations+warm),compute(iterations+warm));
  }

  /** @type {number[]} */
  const localMs=[];
  /** @type {number[]} */
  const remoteMs=[];
  /** @type {number[]} */
  const batchedMs=[];
  for(let round=0;round<rounds;round++) {
    /** @returns {number[]} */
    function localBatch() {
      const result=[];
      const started=performance.now();
      for(let i=0;i<calls;i++) result.push(compute(iterations+(i%7)));
      localMs.push(performance.now()-started);
      return result;
    }
    /** @returns {Promise<number[]>} */
    async function remoteBatch() {
      const result=[];
      const started=performance.now();
      for(let i=0;i<calls;i++) result.push(await remote(iterations+(i%7)));
      remoteMs.push(performance.now()-started);
      return result;
    }
    /** @returns {Promise<number[]>} */
    async function oneBatch() {
      const started=performance.now();
      const result=await remoteAsOneBatch();
      batchedMs.push(performance.now()-started);
      return result;
    }
    /** @type {number[]} */
    let original=[];
    /** @type {number[]} */
    let transformed=[];
    /** @type {number[]} */
    let batched=[];
    if(round%3===0) {
      original=localBatch();
      transformed=await remoteBatch();
      batched=await oneBatch();
    }else if(round%3===1) {
      transformed=await remoteBatch();
      batched=await oneBatch();
      original=localBatch();
    }else{
      batched=await oneBatch();
      original=localBatch();
      transformed=await remoteBatch();
    }
    assert.deepEqual(transformed,original,'RPC computation must match direct evaluation');
    assert.deepEqual(batched,original,'Batched RPC must match direct evaluation');
  }
  const baseline=median(localMs);
  const rpc=median(remoteMs);
  const batch=median(batchedMs);
  return {
    iterationsPerCall:iterations,
    callsPerRound:calls,
    baselineMedianMs:baseline,
    rpcMedianMs:rpc,
    batchedMedianMs:batch,
    ratio:rpc/baseline,
    batchedRatio:batch/baseline,
    within2_5x:rpc/baseline<=2.5,
    batchedWithin2_5x:batch/baseline<=2.5,
    localMs,
    remoteMs,
    batchedMs
  };
}

/** @returns {Promise<void>} */
async function main() {
  const server=http.createServer(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.ready=true;'}
  ],{
    remoteMethods:{compute,batch:createScoBatchMethod({compute},{maxCalls:32})},
    authorizeRpc:()=>true
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listener');
    const results=[];
    for(const size of [32,4096,65536,524288,2097152]) {
      results.push(await measure(address.port,size,7,12));
    }
    const report={
      at:new Date().toISOString(),
      node:process.version,
      platform:process.platform,
      arch:process.arch,
      cpu:os.cpus()[0]?.model,
      rounds:7,
      definition:'median of 7 rounds of 12 calls: local, separate RPCs, and one explicit batch RPC; listener warmup excluded',
      results
    };
    await atomicWrite(path.join(process.cwd(),'rpc-cost-output.json'),JSON.stringify(report,null,2)+'\n');
    for(const item of results) {
      process.stdout.write(`${item.iterationsPerCall} iterations: local=${item.baselineMedianMs.toFixed(3)}ms; rpc=${item.rpcMedianMs.toFixed(3)}ms; ratio=${item.ratio.toFixed(2)}x; <=2.5x=${item.within2_5x}\n`);
      process.stdout.write('batch '+item.iterationsPerCall+' iterations: '+item.batchedMedianMs.toFixed(3)+'ms; ratio='+item.batchedRatio.toFixed(2)+'x; <=2.5x='+item.batchedWithin2_5x+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
