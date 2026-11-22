'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {routingHostname,createRoutingHostResolver}=require('../src/hosts');

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Measure CPU-side elapsed time for the same routing decision on real Host
 * spellings. The test prints observations, without a flaky fixed ratio gate.
 * @param {(header:string)=>boolean} decide
 * @param {string[]} headers
 * @param {number} count
 * @returns {{elapsedMs:number,accepted:number}}
 */
function execute(decide,headers,count){
  let accepted=0;
  const start=process.hrtime.bigint();
  for(let i=0;i<count;i++){
    if(decide(headers[i%headers.length]))accepted++;
  }
  const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
  return {elapsedMs,accepted};
}

test('paired CPU-side baseline versus bounded positive SCO Host cache',()=>{
  const allowed=new Set(['allowed.example','127.0.0.1']);
  const baseline=/** @type {(header:string)=>boolean} */ (
    header=>{
      const hostname=routingHostname(header);
      return hostname!==null&&allowed.has(hostname);
    }
  );
  const cached=createRoutingHostResolver(allowed);
  /** @type {Array<{name:string,headers:string[],expected:boolean}>} */
  const workloads=[
    {name:'repeated DNS Host',headers:['allowed.example:8080'],expected:true},
    {name:'repeated canonicalized IPv4 alias',headers:['127.1:8080'],expected:true},
    {name:'160 rotating allowed Host ports above 128-cache capacity',
      headers:Array.from({length:160},(_,i)=>'allowed.example:'+String(1000+i)),
      expected:true},
    {name:'repeated denied Host cannot occupy the cache',
      headers:['attacker.example:8080'],expected:false}
  ];
  const results=[];
  const iterations=100000;
  for(const workload of workloads){
    const raw={baseline:[],cached:[]};
    const expectedCount=workload.expected?iterations:0;
    for(let pair=0;pair<7;pair++){
      const order=pair%2?['cached','baseline']:['baseline','cached'];
      for(const variant of order){
        const result=execute(variant==='cached'?cached:baseline,
          workload.headers,iterations);
        assert.equal(result.accepted,expectedCount,
          workload.name+'/'+variant+'/'+pair);
        raw[variant].push(result.elapsedMs);
      }
    }
    results.push({
      workload:workload.name,iterations,pairs:7,
      baselineMedianMs:median(raw.baseline),cachedMedianMs:median(raw.cached),
      cachedOverBaselineMedianRatio:median(raw.cached)/median(raw.baseline),
      raw
    });
  }
  console.log('SCO_HOST_ROUTING_CACHE_CPU '+JSON.stringify({
    measuredBoundary:'single-process CPU-side routing decisions, no network',
    node:process.version,results
  }));
});
