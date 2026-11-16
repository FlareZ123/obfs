'use strict';

const assert=require('node:assert/strict');
const {isUtf8}=require('node:buffer');
const {performance}=require('node:perf_hooks');

/** @param {Buffer} bytes @returns {number} */
function permissive(bytes){
  const parsed=/** @type {{args:[string]}} */ (JSON.parse(bytes.toString('utf8')));
  return parsed.args[0].length;
}

/** @param {Buffer} bytes @returns {number} */
function strict(bytes){
  if(!isUtf8(bytes))throw new SyntaxError('Invalid UTF-8 JSON');
  return permissive(bytes);
}

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {(bytes:Buffer)=>number} parse @param {Buffer} bytes @param {number} repeats @returns {{elapsedMs:number,checksum:number}} */
function measure(parse,bytes,repeats){
  let checksum=0;
  const started=performance.now();
  for(let i=0;i<repeats;i++)checksum+=parse(bytes);
  return {elapsedMs:performance.now()-started,checksum};
}

/**
 * Per-request admission CPU sample. This deliberately excludes HTTP
 * transport, authentication, private operation work, and application RTT.
 * @param {number} bytesPerArgument
 * @param {number} repeats
 * @returns {object}
 */
function profile(bytesPerArgument,repeats){
  const bytes=Buffer.from(JSON.stringify({
    method:'compute',
    args:['x'.repeat(bytesPerArgument)]
  }));
  for(let i=0;i<1000;i++){
    assert.equal(permissive(bytes),strict(bytes));
  }
  /** @type {number[]} */
  const baseline=[];
  /** @type {number[]} */
  const admitted=[];
  for(let round=0;round<9;round++){
    const ordered=round%2===0?[permissive,strict]:[strict,permissive];
    for(const fn of ordered){
      const r=measure(fn,bytes,repeats);
      assert.equal(r.checksum,bytesPerArgument*repeats);
      (fn===permissive?baseline:admitted).push(r.elapsedMs/repeats);
    }
  }
  const before=median(baseline);
  const after=median(admitted);
  return {
    utf8Bytes:bytes.length,
    iterationsPerTrial:repeats,
    trials:9,
    baselineMedianMsPerCall:Number(before.toFixed(8)),
    strictMedianMsPerCall:Number(after.toFixed(8)),
    ratio:Number((after/before).toFixed(6)),
    baselineSamplesMsPerCall:baseline,
    strictSamplesMsPerCall:admitted
  };
}

/** @returns {void} */
function main(){
  const cases=[
    profile(64,150000),
    profile(1024,75000),
    profile(16384,7000),
    profile(65536,1500)
  ];
  console.log(JSON.stringify({
    node:process.version,
    platform:process.platform,
    host:process.arch,
    measurement:'pure JSON byte admission CPU, valid data, no RPC or private task',
    cases
  },null,2));
}

if(require.main===module)main();
module.exports={profile};
