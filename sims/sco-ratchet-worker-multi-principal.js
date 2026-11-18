'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeWorkerServer,prepareVictim,post}=require('./sco-ratchet-worker-http-contention');

/** @typedef {{aPrincipal:string,signalPath:string,aStartNs:bigint|null,
 * aEndNs:bigint|null}} ActiveTrial */

/** @param {string} label @param {number} i @returns {string} */
function challenge(label,i){
  return createHash('sha256').update(label+'/'+i).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const copy=[...values].sort((a,b)=>a-b);
  return copy[Math.floor(copy.length/2)];
}

/**
 * Genuine distinct A-principal worker CPU-saturation experiment.
 * Each principal is separately authorized by the trusted server; obtaining
 * those many credentials is an explicit adversarial assumption.
 *
 * @param {number} aCount
 * @param {number} trial
 * @param {boolean} [conventional] Use the equal-trust ordinary HTTP control.
 * @param {Buffer} [root] Same-pair private original root.
 * @returns {Promise<{aCount:number,trial:number,nativeBMs:number,quietBMs:number,
 *  loadedBMs:number,quietRatio:number,loadedRatio:number,loadedVsQuiet:number,
 *  a0PrivateMs:number,a0Overlap:true,validAResponses:number,workerCount:number}>}
 */
async function sample(aCount,trial,conventional=false,root=randomBytes(32)){
  /** @type {ActiveTrial|null} */
  let active=null;
  const backend=makeWorkerServer(root,()=>active,conventional);
  const principalB='B-victim/'+aCount+'/'+trial;
  const quietPrincipal='B-quiet/'+aCount+'/'+trial;
  const tokenB=randomBytes(32).toString('hex');
  const tokenQuiet=randomBytes(32).toString('hex');
  const attackers=Array.from({length:aCount},(_,i)=>({
    principal:'A-'+i+'/'+aCount+'/'+trial,
    token:randomBytes(32).toString('hex'),
    inputs:Array.from({length:64},(_,j)=>challenge('A-'+i,j))
  }));
  backend.grant(tokenB,principalB);
  backend.grant(tokenQuiet,quietPrincipal);
  for(const a of attackers)backend.grant(a.token,a.principal);
  await backend.ready();
  const server=http.createServer(backend.handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-worker-sybil-'));
  const bInputs=Array.from({length:16},(_,i)=>challenge('B',i));
  const native=createPrivateMachine(root);
  /** @type {ReturnType<typeof prepareVictim>|null} */
  let victim=null;
  try{
    const start=process.hrtime.bigint();
    const expectedB=bInputs.map((input,i)=>native.advance(principalB,i,input));
    const nativeBMs=Number(process.hrtime.bigint()-start)/1e6;
    const quietSignal=path.join(folder,'quiet.ready');
    const matched=prepareVictim(base,tokenQuiet,quietSignal,bInputs);
    /** @type {number} */
    let quietBMs=0;
    try{
      await matched.ready;
      fs.writeFileSync(quietSignal+'.tmp','go');
      fs.renameSync(quietSignal+'.tmp',quietSignal);
      const response=await matched.result;
      assert.equal(response.status,200);
      assert.ok(response.elapsedMs!==undefined);
      quietBMs=response.elapsedMs;
      assert.deepEqual(response.outputs,
        bInputs.map((input,i)=>native.advance(quietPrincipal,i,input)));
    }finally{
      matched.child.kill();
    }

    const signalPath=path.join(folder,'a0-begin.ready');
    active={aPrincipal:attackers[0].principal,signalPath,aStartNs:null,aEndNs:null};
    victim=prepareVictim(base,tokenB,signalPath,bInputs);
    await victim.ready;
    const pendingAs=attackers.map(a=>post(base,a.token,a.inputs));
    const b=await victim.result;
    const aReplies=await Promise.all(pendingAs);
    assert.equal(b.status,200);
    assert.deepEqual(b.outputs,expectedB);
    assert.ok(b.submittedNs&&b.elapsedMs!==undefined);
    assert.ok(active.aStartNs!==null&&active.aEndNs!==null,
      'Trusted A0 private worker timestamps absent');
    const entered=BigInt(b.submittedNs);
    assert.ok(entered>=active.aStartNs&&entered<active.aEndNs,
      'Genuine independent B request missed A0 private worker execution');
    for(let i=0;i<attackers.length;i++){
      const a=attackers[i];
      const expected=a.inputs.map((input,index)=>
        native.advance(a.principal,index,input));
      assert.equal(aReplies[i].status,200);
      assert.deepEqual(aReplies[i].value,expected);
    }
    assert.equal(backend.calls(),2*16+aCount*64);
    const loadedBMs=b.elapsedMs;
    return {
      aCount,trial,nativeBMs,quietBMs,loadedBMs,
      quietRatio:quietBMs/nativeBMs,loadedRatio:loadedBMs/nativeBMs,
      loadedVsQuiet:loadedBMs/quietBMs,
      a0PrivateMs:Number(active.aEndNs-active.aStartNs)/1e6,
      a0Overlap:true,validAResponses:aReplies.length,workerCount:aCount+2
    };
  }finally{
    victim?.child.kill();
    await backend.shutdown();
    server.closeAllConnections();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await closed;
    fs.rmSync(folder,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  /** @type {Array<{aCount:number,trial:number,nativeBMs:number,quietBMs:number,
   * loadedBMs:number,quietRatio:number,loadedRatio:number,loadedVsQuiet:number,
   * a0PrivateMs:number,a0Overlap:true,validAResponses:number,workerCount:number}>} */
  const rows=[];
  for(const count of [1,4,8]){
    for(let i=0;i<4;i++)rows.push(await sample(count,i));
  }
  const populations=[1,4,8].map(aCount=>{
    const samples=rows.filter(row=>row.aCount===aCount);
    assert.equal(samples.length,4);
    return {
      principals:aCount,workerCount:aCount+2,trials:samples.length,
      totalOriginalHmacEventsPerTrial:aCount*64+32,
      allBInsideA0:samples.every(row=>row.a0Overlap),
      allAResponses200:samples.every(row=>row.validAResponses===aCount),
      medianLoadedBDirectRatio:median(samples.map(row=>row.loadedRatio)),
      medianQuietBDirectRatio:median(samples.map(row=>row.quietRatio)),
      medianLoadedVsQuiet:median(samples.map(row=>row.loadedVsQuiet)),
      overBudgetBDirect:samples.filter(row=>row.loadedRatio>2.5).length,
      maxLoadedBDirectRatio:Math.max(...samples.map(row=>row.loadedRatio)),
      samples:samples.map(row=>({
        trial:row.trial,nativeBMs:Number(row.nativeBMs.toFixed(5)),
        quietBMs:Number(row.quietBMs.toFixed(5)),
        loadedBMs:Number(row.loadedBMs.toFixed(5)),
        quietRatio:Number(row.quietRatio.toFixed(5)),
        loadedRatio:Number(row.loadedRatio.toFixed(5)),
        loadedVsQuiet:Number(row.loadedVsQuiet.toFixed(5)),
        a0PrivateMs:Number(row.a0PrivateMs.toFixed(5)),a0Overlap:row.a0Overlap
      }))
    };
  });
  return {
    experiment:'Real authenticated SCO per-principal private worker A-principal saturation',
    platform:process.platform,node:process.version,
    availableParallelism:os.availableParallelism(),
    originalPrivateBytesPerEvent:8388608,
    bEventsPerTrial:16,aEventsEachPrincipal:64,
    allNativeOutputParityAndHttp200:true,
    populations,
    caveat:'Multiple independently verified A principals are an extra conditional attacker credential assumption; this tests loaded B HTTP latency, not total CPU overhead or adversarial source secrecy. Resident one-thread-per-principal design has no global worker cap.'
  };
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_WORKER_MULTI_PRINCIPAL '+JSON.stringify(result)+'\n'),
    err=>{process.stderr.write(String(err.stack||err)+'\n');process.exitCode=1;});
}
module.exports={experiment,sample};
