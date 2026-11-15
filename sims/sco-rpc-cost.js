'use strict';

const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createScoHandler}=require('../src');
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
  for(let warm=0;warm<6;warm++) {
    compute(iterations+warm);
    assert.equal(await remote(iterations+warm),compute(iterations+warm));
  }

  /** @type {number[]} */
  const localMs=[];
  /** @type {number[]} */
  const remoteMs=[];
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
    let original;
    let transformed;
    if(round%2===0) {
      original=localBatch();
      transformed=await remoteBatch();
    }else{
      transformed=await remoteBatch();
      original=localBatch();
    }
    assert.deepEqual(transformed,original,'RPC computation must match direct evaluation');
  }
  const baseline=median(localMs);
  const rpc=median(remoteMs);
  return {
    iterationsPerCall:iterations,
    callsPerRound:calls,
    baselineMedianMs:baseline,
    rpcMedianMs:rpc,
    ratio:rpc/baseline,
    within2_5x:rpc/baseline<=2.5,
    localMs,
    remoteMs
  };
}

/** @returns {Promise<void>} */
async function main() {
  const server=http.createServer(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.ready=true;'}
  ],{
    remoteMethods:{compute},
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
      definition:'median of 7 batches of 12 sequential local or loopback RPC calls; listener warmup excluded',
      results
    };
    await atomicWrite(path.join(process.cwd(),'rpc-cost-output.json'),JSON.stringify(report,null,2)+'\n');
    for(const item of results) {
      process.stdout.write(`${item.iterationsPerCall} iterations: local=${item.baselineMedianMs.toFixed(3)}ms; rpc=${item.rpcMedianMs.toFixed(3)}ms; ratio=${item.ratio.toFixed(2)}x; <=2.5x=${item.within2_5x}\n`);
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
