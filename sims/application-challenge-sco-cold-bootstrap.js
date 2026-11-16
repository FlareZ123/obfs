'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

/**
 * Raw chronological ms observations from exact-source GitHub Actions
 * 43807548781, pinned SHA 7b2753378555859b46112cce112a4906da735057.
 * The corresponding cold experiment alternated process-launch order.
 * Values are committed rather than inferred from medians.
 * @type {Record<string,Record<string,{native:number[],remote:number[]}>>}
 */
const samples={
  linux:{
    heavy:{
      native:[46.979768,50.657492,51.323864,49.804070,47.026388,51.027776,47.384760,48.721264,47.489991],
      remote:[126.628680,117.039245,119.110163,112.161916,116.841434,117.735011,116.988429,121.789258,117.806198]
    },
    light:{
      native:[26.709840,26.627097,28.063947,27.106769,26.116347,27.047595,24.883592,29.233812,27.856761],
      remote:[114.387061,109.494314,109.489993,105.134629,105.116638,109.675270,110.078363,108.584412,109.588855]
    }
  },
  win32:{
    heavy:{
      native:[58.6035,60.1028,59.0563,59.4236,55.9791,58.4024,57.6322,60.4718,57.0018],
      remote:[117.0659,117.3587,114.9385,119.1769,115.8407,117.3001,114.1249,116.6633,115.9247]
    },
    light:{
      native:[38.4916,44.1068,40.1667,43.0726,41.7817,46.7783,41.4771,44.3006,40.5477],
      remote:[109.0593,114.7598,114.2290,116.0959,116.8184,119.6304,117.7039,120.0934,118.2603]
    }
  }
};

/**
 * Deterministic SHA-256 counter stream. Use rejection sampling to map
 * unsigned 32-bit words uniformly onto 0..limit-1.
 * @param {string} seed
 * @returns {(limit:number)=>number}
 */
function indexedDraw(seed){
  let counter=0;
  let block=Buffer.alloc(0);
  let offset=0;
  /** @param {number} limit @returns {number} */
  return limit=>{
    assert.ok(Number.isInteger(limit)&&limit>=1&&limit<=0xffffffff);
    const cutoff=Math.floor(4294967296/limit)*limit;
    for(;;){
      if(offset>=block.length){
        block=createHash('sha256').update(seed+'-'+counter++).digest();
        offset=0;
      }
      const word=block.readUInt32LE(offset);
      offset+=4;
      if(word<cutoff)return word%limit;
    }
  };
}

/** @param {number[]} x @returns {number} */
function median(x){
  const sorted=[...x].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {number[]} sorted @param {number} quantile @returns {number} */
function percentile(sorted,quantile){
  const k=(sorted.length-1)*quantile;
  const low=Math.floor(k);
  const high=Math.min(low+1,sorted.length-1);
  return sorted[low]+(sorted[high]-sorted[low])*(k-low);
}

/**
 * Paired bootstrap with replacement across the chronological trial index,
 * same re-sampled indices for native and generated observations. Conditional
 * confidence intervals characterize this sample's variability only.
 * @param {{native:number[],remote:number[]}} dataset
 * @param {string} seed
 * @param {number} trials
 * @returns {{ratio:number,lower:number,upper:number,aboveBudgetFraction:number}}
 */
function bootstrap(dataset,seed,trials){
  const n=dataset.native.length;
  assert.equal(n,dataset.remote.length);
  const draw=indexedDraw(seed);
  const ratios=[];
  let over=0;
  for(let trial=0;trial<trials;trial++){
    const original=[];
    const delivered=[];
    for(let i=0;i<n;i++){
      const index=draw(n);
      original.push(dataset.native[index]);
      delivered.push(dataset.remote[index]);
    }
    const ratio=median(delivered)/median(original);
    ratios.push(ratio);
    if(ratio>2.5)over++;
  }
  ratios.sort((a,b)=>a-b);
  return {
    ratio:median(dataset.remote)/median(dataset.native),
    lower:percentile(ratios,0.025),
    upper:percentile(ratios,0.975),
    aboveBudgetFraction:over/trials
  };
}

/** @returns {void} */
function main(){
  const trials=25000;
  /** @type {Record<string,Record<string,ReturnType<typeof bootstrap>>>} */
  const report={};
  for(const platform of Object.keys(samples)){
    report[platform]={};
    for(const [label,dataset] of Object.entries(samples[platform])){
      report[platform][label]=bootstrap(dataset,
        'agent39-application-cold-'+platform+'-'+label,trials);
    }
  }
  assert.ok(report.linux.heavy.lower<2.5&&report.linux.heavy.upper>2.5,
    'Near-bound Ubuntu heavy sample should remain uncertain');
  assert.ok(report.win32.heavy.upper<2.5);
  assert.ok(report.linux.light.lower>2.5);
  assert.ok(report.win32.light.lower>2.5);
  process.stdout.write('APPLICATION_SCO_COLD_BOOTSTRAP '+JSON.stringify({
    pinnedRun:43807548781,
    trials,method:'paired case-resampling, median ratio, SHA256 counter draw',
    intervals:'conditional percentile 95%, not a universal performance bound',
    report
  })+'\n');
}

if(require.main===module)main();
module.exports={bootstrap,indexedDraw,samples};
