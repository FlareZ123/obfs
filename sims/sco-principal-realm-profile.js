'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes}=require('node:crypto');
const {createScoPrincipalRealmPool}=require('./sco-principal-realm-worker');

/** @param {number[]} samples @returns {number} */
function median(samples){
  const ordered=[...samples].sort((a,b)=>a-b);
  return (ordered[(ordered.length-1)>>1]+ordered[ordered.length>>1])/2;
}
/** @param {()=>Promise<unknown>} operation @returns {Promise<{ns:number,value:unknown}>} */
async function timed(operation){
  const start=process.hrtime.bigint();
  const value=await operation();
  return {ns:Number(process.hrtime.bigint()-start),value};
}

async function main(){
  process.env.SCO_REALM_SECRET=randomBytes(32).toString('hex');
  process.env.SCO_REALM_PRINCIPAL='A';
  const entry=path.resolve(__dirname,'../test/fixtures/sco-principal-realm/private-api.mjs');
  const native=await import(pathToFileURL(entry).href);
  const pool=createScoPrincipalRealmPool(entry,['tick'],{
    maxPrincipals:1,maxPendingPerPrincipal:8
  });
  let nativeSeq=0;
  let workerSeq=0;
  try{
    // Account graph setup is explicitly measured as a server initialization
    // phase and excluded only when the application actually preinitializes.
    const initialization=await timed(()=>pool.initialize('A'));
    const firstCall=await timed(()=>pool.call('A','tick',[++workerSeq,'cold',0]));
    const reference=await native.tick(++nativeSeq,'cold',0);
    assert.deepEqual(firstCall.value,reference);
    /** @type {Array<{bytes:number,pairs:number,medianRatio:number,maxRatio:number,
     * strictOverBudget:number,allRatios:number[]}>} */
    const results=[];
    for(const bytes of [0,1048576,8388608]){
      for(let i=0;i<4;i++){
        const label='warm-'+bytes+'-'+i;
        const expected=await native.tick(++nativeSeq,label,bytes);
        const actual=await pool.call('A','tick',[++workerSeq,label,bytes]);
        assert.deepEqual(actual,expected);
      }
      /** @type {number[]} */
      const ratios=[];
      for(let i=0;i<12;i++){
        const label='measured-'+bytes+'-'+i;
        /** @type {{ns:number,value:unknown}} */
        let nativeCall;
        /** @type {{ns:number,value:unknown}} */
        let workerCall;
        if(i%2===0){
          nativeCall=await timed(()=>native.tick(++nativeSeq,label,bytes));
          workerCall=await timed(()=>pool.call('A','tick',[++workerSeq,label,bytes]));
        }else{
          workerCall=await timed(()=>pool.call('A','tick',[++workerSeq,label,bytes]));
          nativeCall=await timed(()=>native.tick(++nativeSeq,label,bytes));
        }
        assert.deepEqual(workerCall.value,nativeCall.value);
        ratios.push(workerCall.ns/nativeCall.ns);
      }
      results.push({bytes,pairs:ratios.length,medianRatio:median(ratios),
        maxRatio:Math.max(...ratios),strictOverBudget:ratios.filter(x=>x>2.5).length,
        allRatios:ratios});
    }
    console.log(JSON.stringify({
      kind:'SCO-private-worker-IPC-only',node:process.version,platform:process.platform,
      serverInitializationMs:initialization.ns/1e6,
      firstWorkerCallAfterInitializationMs:firstCall.ns/1e6,results,
      restrictions:'No HTTP/TLS/RTT; no client initialization; no universal runtime guarantee'
    }));
  }finally{
    await pool.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
