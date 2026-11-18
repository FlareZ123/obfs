'use strict';

const assert=require('node:assert/strict');
const {workerData,parentPort}=require('node:worker_threads');

/** @typedef {{phase:'ready'|'result'|'error',
 *  submittedNs?:string,elapsedMs?:number,status?:number,
 *  outputs?:string[],error?:string}} WorkerReply */

/** @returns {Promise<void>} */
async function main(){
  assert.ok(parentPort);
  const data=/** @type {{base:string,token:string,inputs:string[],barrier:SharedArrayBuffer}} */(workerData);
  const state=new Int32Array(data.barrier);
  parentPort.postMessage(/** @type {WorkerReply} */({phase:'ready'}));
  // On another thread, this is independent of the main HTTP server event
  // loop. The parent signals immediately before A's synchronous private work.
  const wait=Atomics.wait(state,0,0,120000);
  assert.equal(wait,'ok','Hostile load never entered its private batch');
  const began=process.hrtime.bigint();
  const response=await fetch(data.base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',cookie:'session='+data.token},
    body:JSON.stringify({method:'batch',args:[0,data.inputs]})
  });
  const payload=/** @type {{ok?:boolean,value?:string[]}} */(await response.json());
  const elapsedMs=Number(process.hrtime.bigint()-began)/1e6;
  parentPort.postMessage(/** @type {WorkerReply} */({
    phase:'result',submittedNs:began.toString(),elapsedMs,
    status:response.status,outputs:payload.value
  }));
}

main().catch(error=>{
  parentPort?.postMessage(/** @type {WorkerReply} */({
    phase:'error',error:error instanceof Error?error.stack:String(error)
  }));
  process.exitCode=1;
});
