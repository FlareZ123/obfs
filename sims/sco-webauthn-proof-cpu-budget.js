'use strict';

const assert=require('node:assert/strict');
const os=require('node:os');
const {
  createHash,generateKeyPairSync,randomBytes,sign,verify,timingSafeEqual
}=require('node:crypto');

/**
 * Fixture with the same SHA-256 RP hash, UP+UV flags, signed clientData and
 * P-256 signature verification primitives as the real SCO browser pilot.
 * Key generation and signing are deliberately outside each timed batch.
 * @returns {Array<{
 *   challenge:Buffer,clientData:Buffer,authenticatorData:Buffer,
 *   signature:Buffer,publicKey:import('node:crypto').KeyObject
 * }>}
 */
function createSignedProofs(){
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const rpHash=createHash('sha256').update('localhost').digest();
  return Array.from({length:16},()=>{
    const challenge=randomBytes(32);
    const clientData=Buffer.from(JSON.stringify({
      type:'webauthn.get',
      origin:'http://localhost',
      challenge:challenge.toString('base64url')
    }));
    const authenticatorData=Buffer.concat([
      rpHash,Buffer.from([0x05]),Buffer.alloc(4)
    ]);
    const clientHash=createHash('sha256').update(clientData).digest();
    const signed=Buffer.concat([authenticatorData,clientHash]);
    const signature=sign('sha256',signed,privateKey);
    return {challenge,clientData,authenticatorData,signature,publicKey};
  });
}

/**
 * Isolated CPU surrogate for one server-side WebAuthn operation verifier.
 * Deliberately excludes challenge issuance, browser signing, HTTP and parsing
 * signed-assertion header JSON; this is a lower-bound admission cost, not a
 * production protocol implementation.
 * @param {ReturnType<typeof createSignedProofs>[number]} record
 * @returns {boolean}
 */
function verifySignedProof(record){
  const data=/** @type {{type:string,origin:string,challenge:string}} */(
    JSON.parse(record.clientData.toString('utf8'))
  );
  if(data.type!=='webauthn.get'||data.origin!=='http://localhost'||
     data.challenge!==record.challenge.toString('base64url'))return false;
  const rpHash=createHash('sha256').update('localhost').digest();
  const authenticatorData=record.authenticatorData;
  if(authenticatorData.length<37||
     !timingSafeEqual(authenticatorData.subarray(0,32),rpHash)||
     (authenticatorData[32]&0x05)!==0x05)return false;
  const clientHash=createHash('sha256').update(record.clientData).digest();
  return verify('sha256',Buffer.concat([authenticatorData,clientHash]),
    record.publicKey,record.signature);
}

/**
 * A deterministic, output-dependent integer kernel representing protected
 * native JavaScript work. Its input changes between operations so the loop
 * cannot be eliminated as a fixed constant by V8.
 * @param {number} input
 * @param {number} rounds
 * @returns {number}
 */
function nativeKernel(input,rounds){
  let state=input|0;
  for(let i=0;i<rounds;i++){
    state=(Math.imul(state^i,0x9e3779b1)+0x7f4a7c15)|0;
  }
  return state;
}

/**
 * @param {number} rounds
 * @param {number} operations
 * @param {boolean} protectedOperation
 * @param {ReturnType<typeof createSignedProofs>} fixtures
 * @param {number} [aggregation]
 * @returns {{cpuUs:number,wallMs:number,checksum:number}}
 */
function runBatch(rounds,operations,protectedOperation,fixtures,aggregation=1){
  const cpuBefore=process.cpuUsage();
  const start=process.hrtime.bigint();
  let checksum=0;
  for(let repeat=0;repeat<aggregation;repeat++){
    let batchChecksum=0;
    for(let i=0;i<operations;i++){
      if(protectedOperation&&!verifySignedProof(fixtures[i&15])){
        throw new Error('Cryptographic proof verification failed');
      }
      batchChecksum^=nativeKernel(i+1,rounds);
    }
    checksum=(checksum+batchChecksum)|0;
  }
  const elapsedNs=process.hrtime.bigint()-start;
  const cpu=process.cpuUsage(cpuBefore);
  return {
    cpuUs:cpu.user+cpu.system,
    wallMs:Number(elapsedNs)/1e6,
    checksum
  };
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @typedef {{
 *  original:{cpuUs:number,wallMs:number,checksum:number},
 *  proof:{cpuUs:number,wallMs:number,checksum:number}
 * }} Pair
 */

/**
 * @param {string} name
 * @param {number} rounds
 * @param {number} operations
 * @param {ReturnType<typeof createSignedProofs>} fixtures
 * @param {number} aggregation
 */
function profile(name,rounds,operations,fixtures,aggregation){
  /** @type {Pair[]} */
  const pairs=[];
  for(let index=0;index<7;index++){
    const originalFirst=index%2===0;
    const first=runBatch(rounds,operations,!originalFirst,fixtures,aggregation);
    const second=runBatch(rounds,operations,originalFirst,fixtures,aggregation);
    const original=originalFirst?first:second;
    const proof=originalFirst?second:first;
    assert.equal(proof.checksum,original.checksum,'paired output parity');
    assert.ok(original.cpuUs>0&&proof.cpuUs>0,'measurement resolution');
    pairs.push({original,proof});
  }
  const nativeCpuMedian=median(pairs.map(p=>p.original.cpuUs));
  const proofCpuMedian=median(pairs.map(p=>p.proof.cpuUs));
  const timedOperations=operations*aggregation;
  return {
    name,rounds,operations,aggregation,timedOperations,repeats:7,
    originalCpuUsPerOperation:nativeCpuMedian/timedOperations,
    proofCpuUsPerOperation:proofCpuMedian/timedOperations,
    serverCpuRatio:proofCpuMedian/nativeCpuMedian,
    serverCpuWithin2_5x:proofCpuMedian<=2.5*nativeCpuMedian,
    samples:pairs
  };
}

/**
 * @returns {{
 *  node:string,platform:string,arch:string,cpuModel:string,
 *  limits:{browserCpuIncluded:boolean,networkCpuIncluded:boolean},
 *  profiles:ReturnType<typeof profile>[]
 * }}
 */
function runBudgetProbe(){
  const fixtures=createSignedProofs();
  for(const f of fixtures)assert.ok(verifySignedProof(f));
  runBatch(500,100,false,fixtures);
  runBatch(500,100,true,fixtures);
  runBatch(250000,2,false,fixtures);
  runBatch(250000,2,true,fixtures);
  const profiles=[
    profile('small-500-round',500,4000,fixtures,8),
    profile('coarse-250000-round',250000,60,fixtures,8)
  ];
  return {
    node:process.version,platform:process.platform,arch:process.arch,
    cpuModel:os.cpus()[0]?.model??'unknown',
    limits:{browserCpuIncluded:false,networkCpuIncluded:false},
    profiles
  };
}

if(require.main===module){
  process.stdout.write('SCO_WEBAUTHN_SERVER_CPU '+JSON.stringify(runBudgetProbe())+'\n');
}

module.exports={runBudgetProbe,nativeKernel};
