'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{phase:'ready'|'begin'|'done',startNs?:string,endNs?:string,values?:Array<string|null>}} WorkerReply */
/** @typedef {{worker:Worker,ready:Promise<void>}} WorkerSession */
/** @typedef {{elapsedMs:number,submittedNs:bigint,reply:WorkerReply}} WorkResult */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const copy=[...values].sort((a,b)=>a-b);
  return copy[Math.floor(copy.length/2)];
}

if(!isMainThread){
  const config=/** @type {{root:string,principal:string}} */(workerData);
  const machine=createPrivateMachine(Buffer.from(config.root,'hex'));
  if(!parentPort)throw new Error('Worker port missing');
  const port=parentPort;
  port.on('message',/** @param {{type:string,inputs:string[]}} task */task=>{
    if(task.type!=='work')throw new TypeError('Unknown worker operation');
    const started=process.hrtime.bigint();
    port.postMessage({phase:'begin',startNs:started.toString()});
    const values=task.inputs.map((input,index)=>
      machine.advance(config.principal,index,input));
    const ended=process.hrtime.bigint();
    port.postMessage({phase:'done',startNs:started.toString(),
      endNs:ended.toString(),values});
  });
  port.postMessage({phase:'ready'});
}

/**
 * Prepare a resident, per-principal worker before the timed service window.
 * The SCO/SNO setup exemption can amortize thread startup. This harness
 * does not implement a network service or independent CPU quota.
 * @param {Buffer} root
 * @param {string} principal
 * @returns {WorkerSession}
 */
function spawnResident(root,principal){
  const worker=new Worker(__filename,{
    workerData:{root:root.toString('hex'),principal}
  });
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    worker.once('message',/** @param {WorkerReply} message */message=>{
      if(message.phase==='ready')resolve();
      else reject(new TypeError('Unexpected first worker message'));
    });
    worker.once('error',reject);
  });
  return {worker,ready};
}

/**
 * Dispatch an operation to an already-ready account-specific worker.
 * @param {Worker} worker
 * @param {string[]} inputs
 * @param {(message:WorkerReply)=>void} [onBegin]
 * @returns {Promise<WorkResult>}
 */
function execute(worker,inputs,onBegin){
  return new Promise((resolve,reject)=>{
    const submittedNs=process.hrtime.bigint();
    const onError=/** @param {Error} error */error=>{
      worker.off('message',onMessage);
      worker.off('error',onError);
      reject(error);
    };
    /** @param {WorkerReply} message */
    const onMessage=message=>{
      if(message.phase==='begin'){
        onBegin?.(message);
        return;
      }
      if(message.phase!=='done')return;
      worker.off('message',onMessage);
      worker.off('error',onError);
      resolve({elapsedMs:Number(process.hrtime.bigint()-submittedNs)/1e6,
        submittedNs,reply:message});
    };
    worker.on('message',onMessage);
    worker.once('error',onError);
    worker.postMessage({type:'work',inputs});
  });
}

/**
 * Source-pinned worker-isolation pilot for Agent 7's cross-principal
 * contention veto. Compare a native direct B batch, a quiet B resident
 * worker request, and a loaded B request during an A resident worker
 * HMAC batch. Timed work starts after resident worker initialization.
 *
 * @param {number} [trials]
 * @returns {Promise<{trials:number,overlapCount:number,
 *    directBMs:number[],quietBMs:number[],loadedBMs:number[],
 *    loadedVsDirect:number[],loadedVsQuiet:number[],
 *    overBudgetDirect:number,overBudgetQuiet:number,
 *    medianLoadedVsDirect:number,medianLoadedVsQuiet:number}>}
 */
async function experiment(trials=7){
  const root=createHash('sha256').update('obfs-worker-isolation-pilot-v1').digest();
  /** @type {number[]} */
  const directBMs=[],quietBMs=[],loadedBMs=[],loadedVsDirect=[],loadedVsQuiet=[];
  let overlapCount=0;
  for(let trial=0;trial<trials;trial++){
    const qPrincipal='quiet-B/'+trial;
    const bPrincipal='loaded-B/'+trial;
    const aPrincipal='attacker-A/'+trial;
    const bInputs=Array.from({length:16},(_,i)=>challenge('B',i));
    const aInputs=Array.from({length:64},(_,i)=>challenge('A',i));
    const native=createPrivateMachine(root);
    const nativeStart=process.hrtime.bigint();
    const nativeB=bInputs.map((input,i)=>native.advance(bPrincipal,i,input));
    const directMs=Number(process.hrtime.bigint()-nativeStart)/1e6;
    const expectedQuiet=bInputs.map((input,i)=>native.advance(qPrincipal,i,input));
    const expectedA=aInputs.map((input,i)=>native.advance(aPrincipal,i,input));

    const quiet=spawnResident(root,qPrincipal);
    const victim=spawnResident(root,bPrincipal);
    const attacker=spawnResident(root,aPrincipal);
    const sessions=[quiet,victim,attacker];
    try{
      await Promise.all(sessions.map(session=>session.ready));
      const quietWork=await execute(quiet.worker,bInputs);
      assert.deepEqual(quietWork.reply.values,expectedQuiet);
      /** @type {(message:WorkerReply)=>void} */
      let markBegin=()=>{};
      /** @type {Promise<WorkerReply>} */
      const began=new Promise(resolve=>{markBegin=resolve;});
      const aWork=execute(attacker.worker,aInputs,markBegin);
      const aBegin=await began;
      assert.ok(aBegin.startNs);
      const bWork=execute(victim.worker,bInputs);
      const [aResult,bResult]=await Promise.all([aWork,bWork]);
      assert.deepEqual(aResult.reply.values,expectedA);
      assert.deepEqual(bResult.reply.values,nativeB);
      assert.ok(aResult.reply.endNs);
      const aStartNs=BigInt(aBegin.startNs);
      const aEndNs=BigInt(aResult.reply.endNs);
      const enteredDuringA=bResult.submittedNs>=aStartNs &&
        bResult.submittedNs<aEndNs;
      assert.ok(enteredDuringA,'Victim was not submitted during A private HMAC execution');
      overlapCount++;
      directBMs.push(directMs);
      quietBMs.push(quietWork.elapsedMs);
      loadedBMs.push(bResult.elapsedMs);
      loadedVsDirect.push(bResult.elapsedMs/directMs);
      loadedVsQuiet.push(bResult.elapsedMs/quietWork.elapsedMs);
    }finally{
      await Promise.all(sessions.map(session=>session.worker.terminate()));
    }
  }
  return {trials,overlapCount,directBMs,quietBMs,loadedBMs,
    loadedVsDirect,loadedVsQuiet,
    overBudgetDirect:loadedVsDirect.filter(value=>value>2.5).length,
    overBudgetQuiet:loadedVsQuiet.filter(value=>value>2.5).length,
    medianLoadedVsDirect:median(loadedVsDirect),
    medianLoadedVsQuiet:median(loadedVsQuiet)};
}

if(isMainThread&&require.main===module)experiment().then(result=>
  process.stdout.write('OBFS_SCO_WORKER_FAIRNESS '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={experiment};
