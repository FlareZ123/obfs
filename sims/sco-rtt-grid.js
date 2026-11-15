'use strict';

const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoBatchMethod}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Repeatable CPU workload independent of HTTP.
 * @param {number} iterations
 * @returns {number}
 */
function compute(iterations) {
  let value=2166136261;
  for(let i=0;i<iterations;i++)value=Math.imul(value^(i&255),16777619)>>>0;
  return value;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}

/** @param {number} milliseconds @returns {Promise<void>} */
function delay(milliseconds) {
  return new Promise(resolve=>setTimeout(resolve,milliseconds));
}

/**
 * Measure requested RPC response, bytes, and HTTP elapsed time.
 * @param {string} url
 * @param {string} method
 * @param {unknown[]} args
 * @returns {Promise<{value:any,ms:number,requestBytes:number,responseBytes:number}>}
 */
async function invoke(url,method,args) {
  const body=JSON.stringify({method,args});
  const started=performance.now();
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});
  const received=await response.text();
  const ms=performance.now()-started;
  const payload=JSON.parse(received);
  if(!response.ok || !payload.ok)throw new Error('RPC failed: '+response.status);
  return {
    value:payload.value,ms,
    requestBytes:Buffer.byteLength(body,'utf8'),
    responseBytes:Buffer.byteLength(received,'utf8')
  };
}

/**
 * Run local, sequential requests, independent parallel requests, and one
 * sequential server batch against the same 12-call workload and fixed
 * simulated authorization/transport wait per HTTP request.
 * @param {number} port
 * @param {number} iterations
 * @param {number} latency
 * @param {number} calls
 * @param {number} rounds
 * @returns {Promise<object>}
 */
async function measure(port,iterations,latency,calls,rounds) {
  const url='http://127.0.0.1:'+port+'/obfs/rpc';
  const sizes=Array.from({length:calls},(_,index)=>iterations+(index%7));
  const expected=sizes.map(compute);

  // Warm the V8 workload and Node fetch connection pool before collection.
  for(let i=0;i<4;i++)assert.equal((await invoke(url,'compute',[iterations+i])).value,compute(iterations+i));
  /** @type {{local:number[],serial:number[],parallel:number[],batch:number[]}} */
  const times={local:[],serial:[],parallel:[],batch:[]};
  /** @type {{serial:number[],parallel:number[],batch:number[]}} */
  const requestLatencies={serial:[],parallel:[],batch:[]};
  /** @type {{serial:number,parallel:number,batch:number}} */
  const sentBytes={serial:0,parallel:0,batch:0};
  /** @type {{serial:number,parallel:number,batch:number}} */
  const receivedBytes={serial:0,parallel:0,batch:0};

  /** @param {'local'|'serial'|'parallel'|'batch'} strategy @returns {Promise<void>} */
  async function record(strategy) {
    const started=performance.now();
    /** @type {number[]} */
    let result=[];
    if(strategy==='local') {
      result=sizes.map(compute);
    } else if(strategy==='serial') {
      for(const size of sizes) {
        const outcome=await invoke(url,'compute',[size]);
        result.push(outcome.value);
        requestLatencies.serial.push(outcome.ms);
        sentBytes.serial+=outcome.requestBytes;
        receivedBytes.serial+=outcome.responseBytes;
      }
    } else if(strategy==='parallel') {
      const outcomes=await Promise.all(sizes.map(size=>invoke(url,'compute',[size])));
      result=outcomes.map(outcome=>outcome.value);
      for(const outcome of outcomes) {
        requestLatencies.parallel.push(outcome.ms);
        sentBytes.parallel+=outcome.requestBytes;
        receivedBytes.parallel+=outcome.responseBytes;
      }
    } else {
      const commands=sizes.map(size=>({method:'compute',args:[size]}));
      const outcome=await invoke(url,'batch',[commands]);
      if(!Array.isArray(outcome.value)||outcome.value.some(item=>!item.ok)) {
        throw new Error('Batched server computation failed');
      }
      result=outcome.value.map(item=>item.value);
      requestLatencies.batch.push(outcome.ms);
      sentBytes.batch+=outcome.requestBytes;
      receivedBytes.batch+=outcome.responseBytes;
    }
    const ms=performance.now()-started;
    assert.deepEqual(result,expected,'Strategy '+strategy+' changed result');
    times[strategy].push(ms);
  }

  for(let round=0;round<rounds;round++) {
    const orders=[
      ['local','serial','parallel','batch'],
      ['batch','parallel','serial','local'],
      ['parallel','local','batch','serial'],
      ['serial','batch','local','parallel']
    ];
    for(const label of orders[round%orders.length]) {
      await record(/** @type {'local'|'serial'|'parallel'|'batch'} */ (label));
    }
  }
  const baseline=median(times.local);
  return {
    iterationsPerCall:iterations,simulatedPerRequestDelayMs:latency,
    callsPerRound:calls,rounds,
    localMedianMs:baseline,
    serialMedianMs:median(times.serial),
    parallelMedianMs:median(times.parallel),
    batchMedianMs:median(times.batch),
    serialRatio:median(times.serial)/baseline,
    parallelRatio:median(times.parallel)/baseline,
    batchRatio:median(times.batch)/baseline,
    within2_5x:{
      serial:median(times.serial)/baseline<=2.5,
      parallel:median(times.parallel)/baseline<=2.5,
      batch:median(times.batch)/baseline<=2.5
    },
    times,requestLatencies,sentBytes,receivedBytes
  };
}

/** @returns {Promise<void>} */
async function main() {
  const injected={latency:0};
  const server=http.createServer(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.ready=true;'}
  ],{
    remoteMethods:{compute,batch:createScoBatchMethod({compute},{maxCalls:64})},
    authorizeRpc:async()=>{
      if(injected.latency>0)await delay(injected.latency);
      return true;
    }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listener');
    /** @type {object[]} */
    const results=[];
    for(const latency of [0,5,25,100]) {
      injected.latency=latency;
      for(const workload of [4096,65536,524288]) {
        const result=await measure(address.port,workload,latency,12,5);
        results.push(result);
        const item=/** @type {{serialRatio:number,parallelRatio:number,batchRatio:number}} */ (result);
        process.stdout.write('delay='+latency+'ms iter='+workload+
          ' serial='+item.serialRatio.toFixed(2)+'x parallel='+item.parallelRatio.toFixed(2)+
          'x batched='+item.batchRatio.toFixed(2)+'x\n');
      }
    }
    const report={
      date:new Date().toISOString(),
      node:process.version,platform:process.platform,arch:process.arch,
      cpu:os.cpus()[0]?.model,
      conditions:'One Node process, loopback HTTP, measured 12-call batches, auth wait injected once per HTTP request, Node fetch; rounds=5, warmup=4',
      results
    };
    await atomicWrite(path.join(process.cwd(),'rpc-rtt-grid-output.json'),JSON.stringify(report,null,2)+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
