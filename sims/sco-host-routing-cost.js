'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {canonicalAllowedHosts,routingHostname}=require('../src/hosts');

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[(sorted.length-1)>>1];
}

/**
 * A request-time string-array remap is the source-matched prepatch reference.
 * Both variants use identical strings and the same (spoofable) DNS Host field.
 * @param {string[]} allowed
 * @param {string} header
 * @returns {boolean}
 */
function oldMatches(allowed,header) {
  return allowed.map(host=>host.toLowerCase()).includes(header.split(':')[0].toLowerCase());
}

/** @param {Set<string>} allowed @param {string} header @returns {boolean} */
function currentMatches(allowed,header) {
  const hostname=routingHostname(header);
  return hostname!==null && allowed.has(hostname);
}

/**
 * Synthetic per-request Host-prefilter microbenchmark. Does not measure
 * HTTP, authorization, obfuscated work, network, browser or 2.5x budgets.
 * Alternates order to reduce directional warmup bias. Record every sample.
 * @param {number} hostCount
 * @param {number} iterations
 * @returns {{count:number,iterations:number,legacyMedianMs:number,currentMedianMs:number,ratio:number,legacySamplesMs:number[],currentSamplesMs:number[]}}
 */
function compare(hostCount,iterations=80000) {
  const hosts=Array.from({length:hostCount-1},(_,index)=>'HOST'+index+'.EXAMPLE');
  hosts.push('APPROVED.EXAMPLE');
  const routing=new Set(canonicalAllowedHosts(hosts));
  const incoming='approved.example:9090';
  const legacy=()=>oldMatches(hosts,incoming);
  const current=()=>currentMatches(routing,incoming);
  for(let index=0;index<5000;index++){assert.equal(legacy(),true);assert.equal(current(),true);}
  /** @type {number[]} */ const legacySamplesMs=[];
  /** @type {number[]} */ const currentSamplesMs=[];
  let observedLegacy=0,observedCurrent=0;
  for(let trial=0;trial<9;trial++){
    for(const variant of trial%2===0?['legacy','current']:['current','legacy']){
      const start=performance.now();
      let successes=0;
      if(variant==='legacy'){
        for(let index=0;index<iterations;index++)if(legacy())successes++;
        legacySamplesMs.push(performance.now()-start);
        observedLegacy+=successes;
      }else{
        for(let index=0;index<iterations;index++)if(current())successes++;
        currentSamplesMs.push(performance.now()-start);
        observedCurrent+=successes;
      }
    }
  }
  assert.equal(observedLegacy,9*iterations);
  assert.equal(observedCurrent,9*iterations);
  const previous=median(legacySamplesMs),currentMs=median(currentSamplesMs);
  return {count:hostCount,iterations,
    legacyMedianMs:previous,currentMedianMs:currentMs,
    ratio:previous/currentMs,legacySamplesMs,currentSamplesMs};
}

/** @returns {void} */
function main() {
  const results=[1,8,128].map(count=>compare(count));
  process.stdout.write(JSON.stringify({
    platform:process.platform,node:process.version,
    scope:'single Host routing prefilter only: not a 2.5x program budget',
    results
  },null,2)+'\n');
}

if(require.main===module)main();

module.exports={compare,oldMatches,currentMatches};
