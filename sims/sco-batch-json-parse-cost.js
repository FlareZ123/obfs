'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {pairedBudgetBound}=require('./paired-budget-bound');

/**
 * Build an actual valid bounded SCO batch request with unique per-call data.
 * This experiment times JSON parsing only, excluding TCP, authorization,
 * private method execution and response serialization.
 * @param {number} calls
 * @returns {string}
 */
function payload(calls) {
  return JSON.stringify({method:'batch',args:[
    Array.from({length:calls},(_,i)=>({
      method:'work',args:[i,{'label':String(i).padStart(4,'0')+'x'.repeat(64)}]
    }))
  ]});
}

/**
 * @param {string} body
 * @param {number} loops
 * @param {number} parsesPerRequest
 * @returns {{ms:number,checksum:number}}
 */
function measure(body,loops,parsesPerRequest) {
  let checksum=0;
  const before=performance.now();
  for(let i=0;i<loops;i++) {
    for(let j=0;j<parsesPerRequest;j++){
      const query=JSON.parse(body);
      checksum+=query.args[0].length;
    }
  }
  return {ms:performance.now()-before,checksum};
}

/**
 * Compare the old one-parse admission cost against the two additional
 * independent views used to isolate recognized SCO batch policy mutations.
 * Do not confuse a parser-only slowdown with full authenticated RPC cost.
 * @param {number} callCount
 * @param {number} [iterations]
 * @param {number} [pairs]
 * @returns {object}
 */
function profile(callCount,iterations=300,pairs=13) {
  const body=payload(callCount);
  const bytes=Buffer.byteLength(body,'utf8');
  assert.ok(bytes<65536,'Payload must be below the default SCO RPC cap');
  for(let i=0;i<4;i++) {
    measure(body,iterations,1);
    measure(body,iterations,3);
  }
  /** @type {number[]} */
  const admission=[];
  /** @type {number[]} */
  const independentViews=[];
  for(let trial=0;trial<pairs;trial++) {
    const order=trial%2===0?[1,3]:[3,1];
    for(const n of order) {
      const actual=measure(body,iterations,n);
      assert.equal(actual.checksum,callCount*iterations*n);
      (n===1?admission:independentViews).push(actual.ms);
    }
  }
  return {
    calls:callCount,payloadBytes:bytes,iterations,pairs,
    admissionMs:admission,threeParseMs:independentViews,
    paired:pairedBudgetBound(admission,independentViews)
  };
}

/** @returns {void} */
function main(){
  const rows=[1,16,64].map(calls=>profile(calls));
  console.log(JSON.stringify({
    node:process.version,platform:process.platform,architecture:process.arch,
    compared:'native JSON.parse once versus three independent identical parses',
    interpretation:'parser-only in-process overhead, not whole SCO RPC slowdown',
    rows
  },null,2));
}

if(require.main===module)main();

module.exports={profile,payload,measure};
