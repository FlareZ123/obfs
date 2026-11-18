'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {fork}=require('node:child_process');
const {randomBytes,createHash}=require('node:crypto');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeServer}=require('./sco-ratchet-batch-candidate');

/** @typedef {{phase:'ready'|'result'|'error',submittedNs?:string,
 * elapsedMs?:number,status?:number,outputs?:string[],error?:string}} ChildReply */
/** @typedef {{aPrincipal:string,signalPath:string,aStartNs:bigint|null,
 * aEndNs:bigint|null}} Trial */
/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} base
 * @param {string} token
 * @param {string[]} inputs
 * @returns {Promise<Reply>}
 */
async function post(base,token,inputs){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',cookie:'session='+token},
    body:JSON.stringify({method:'batch',args:[0,inputs]})
  });
  const payload=/** @type {{ok?:boolean,value?:string[]}} */(await response.json());
  return {status:response.status,value:payload.value};
}

/**
 * Spawn a genuine independent Node client for Account B. It starts the valid
 * HTTP request after the parent atomically publishes the exact A-start marker.
 * @param {string} base
 * @param {string} token
 * @param {string} signalPath
 * @param {string[]} inputs
 * @returns {{child:import('node:child_process').ChildProcess,
 * ready:Promise<void>,result:Promise<ChildReply>}}
 */
function prepareVictim(base,token,signalPath,inputs){
  const child=fork(require.resolve('./sco-ratchet-cross-account-worker'),[
    base,token,signalPath,JSON.stringify(inputs)
  ],{silent:true});
  /** @type {(value:void)=>void} */
  let acceptReady=()=>{};
  /** @type {(value:ChildReply)=>void} */
  let acceptResult=()=>{};
  /** @type {(reason:unknown)=>void} */
  let refuseReady=()=>{};
  /** @type {(reason:unknown)=>void} */
  let refuseResult=()=>{};
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    acceptReady=resolve;refuseReady=reject;
  });
  /** @type {Promise<ChildReply>} */
  const result=new Promise((resolve,reject)=>{
    acceptResult=resolve;refuseResult=reject;
  });
  let finished=false;
  child.on('message',/** @param {ChildReply} message */message=>{
    if(message.phase==='ready')acceptReady();
    else if(message.phase==='result'){
      finished=true;
      acceptResult(message);
    }else if(message.phase==='error'){
      const error=new Error(message.error??'Account B worker failed');
      refuseReady(error);refuseResult(error);
    }
  });
  child.on('error',error=>{refuseReady(error);refuseResult(error);});
  child.on('exit',code=>{
    if(!finished){
      const error=new Error('Account B worker exited before result, code '+code);
      refuseReady(error);refuseResult(error);
    }
  });
  return {child,ready,result};
}

/**
 * Reproduce the prompt's A-unlimited-legitimate-requests threat against
 * per-principal isolation in a single Node event loop. Source A and B keys
 * and principals remain distinct. The child process starts B while trusted
 * Node is synchronously processing A's private HMAC batch.
 * @returns {Promise<object>}
 */
async function experiment(){
  const root=randomBytes(32);
  /** @type {Trial|null} */
  let current=null;
  const backend=makeServer(root,0,undefined,
    (principal,start)=>{
      if(!current||principal!==current.aPrincipal||start!==0)return;
      current.aStartNs=process.hrtime.bigint();
      // Single writer and unique same-directory target: publish the marker
      // atomically so the separate child never observes a partial signal.
      fs.writeFileSync(current.signalPath+'.tmp','go');
      fs.renameSync(current.signalPath+'.tmp',current.signalPath);
    },
    (principal,start)=>{
      if(current&&principal===current.aPrincipal&&start===0)
        current.aEndNs=process.hrtime.bigint();
    });
  const server=http.createServer(backend.handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-sco-contention-'));
  /** @type {Array<{nativeBMs:number,quietBMs:number,matchedQuietBMs:number,
   * loadedBMs:number,quietRatio:number,matchedQuietRatio:number,
   * loadedRatio:number,aBusyMs:number,overlap:true}>} */
  const samples=[];
  try{
    for(let trial=0;trial<7;trial++){
      const quietPrincipal='quiet-B/'+trial;
      const matchedQuietPrincipal='quiet-child-B/'+trial;
      const bPrincipal='victim-B/'+trial;
      const aPrincipal='attacker-A/'+trial;
      const quietToken=randomBytes(32).toString('hex');
      const matchedQuietToken=randomBytes(32).toString('hex');
      const bToken=randomBytes(32).toString('hex');
      const aToken=randomBytes(32).toString('hex');
      backend.grant(quietToken,quietPrincipal);
      backend.grant(matchedQuietToken,matchedQuietPrincipal);
      backend.grant(bToken,bPrincipal);
      backend.grant(aToken,aPrincipal);
      const bInputs=Array.from({length:16},(_,i)=>challenge(i));
      const aInputs=Array.from({length:64},(_,i)=>challenge(i+1000));
      const native=createPrivateMachine(root);
      const started=process.hrtime.bigint();
      const nativeB=bInputs.map((input,i)=>native.advance(bPrincipal,i,input));
      const nativeBMs=Number(process.hrtime.bigint()-started)/1e6;
      assert.equal(nativeB.length,16);
      const quietStarted=process.hrtime.bigint();
      const quiet=await post(base,quietToken,bInputs);
      const quietBMs=Number(process.hrtime.bigint()-quietStarted)/1e6;
      assert.equal(quiet.status,200);
      assert.deepEqual(quiet.value,bInputs.map((value,i)=>
        native.advance(quietPrincipal,i,value)));
      // Matched control: a separate cold HTTP client process with exactly
      // the same fetch path as the loaded B process, but no A contention.
      const quietSignalPath=path.join(folder,'quiet-'+trial+'.ready');
      const matched=prepareVictim(base,matchedQuietToken,quietSignalPath,bInputs);
      /** @type {number} */
      let matchedQuietBMs;
      try{
        await matched.ready;
        fs.writeFileSync(quietSignalPath+'.tmp','go');
        fs.renameSync(quietSignalPath+'.tmp',quietSignalPath);
        const response=await matched.result;
        assert.equal(response.status,200);
        assert.ok(response.elapsedMs!==undefined);
        assert.deepEqual(response.outputs,bInputs.map((value,i)=>
          native.advance(matchedQuietPrincipal,i,value)));
        matchedQuietBMs=response.elapsedMs;
      }finally{
        matched.child.kill();
      }
      const signalPath=path.join(folder,'a-'+trial+'.ready');
      current={aPrincipal,signalPath,aStartNs:null,aEndNs:null};
      const child=prepareVictim(base,bToken,signalPath,bInputs);
      try{
        await child.ready;
        const pendingA=post(base,aToken,aInputs);
        const b=await child.result;
        const a=await pendingA;
        assert.equal(a.status,200);
        assert.equal(b.status,200);
        assert.deepEqual(a.value,aInputs.map((input,i)=>
          native.advance(aPrincipal,i,input)));
        assert.deepEqual(b.outputs,nativeB);
        assert.ok(b.submittedNs&&b.elapsedMs!==undefined);
        const aStart=current.aStartNs,aEnd=current.aEndNs;
        assert.ok(aStart!==null&&aEnd!==null,
          'Missing independently observed A private batch entry and exit');
        const bSubmitted=BigInt(b.submittedNs);
        assert.ok(bSubmitted>=aStart&&bSubmitted<aEnd,
          'Account B client did not attempt HTTP while private A CPU was executing');
        const aBusyMs=Number(aEnd-aStart)/1e6;
        samples.push({
          nativeBMs,quietBMs,matchedQuietBMs,loadedBMs:b.elapsedMs,
          quietRatio:quietBMs/nativeBMs,
          matchedQuietRatio:matchedQuietBMs/nativeBMs,
          loadedRatio:b.elapsedMs/nativeBMs,
          aBusyMs,overlap:true
        });
      }finally{
        child.child.kill();
        current=null;
      }
    }
    assert.equal(samples.length,7);
    assert.equal(backend.calls(),7*(16+16+64+16));
    const loadedOverBudget=samples.filter(s=>s.loadedRatio>2.5).length;
    const quietOverBudget=samples.filter(s=>s.quietRatio>2.5).length;
    const matchedQuietOverBudget=samples.filter(s=>s.matchedQuietRatio>2.5).length;
    return {
      experiment:'Authorized A 64-event synchronous HMAC burst blocks unrelated B 16-event SCO RPC',
      platform:process.platform,node:process.version,
      hashRootBytes:root.length,privateWorkBytesPerEvent:8388608,
      attackerEventsPerTrial:64,victimEventsPerTrial:16,quietEventsPerTrial:16,
      statusCodesAll200:true,independentChildProcess:true,
      overlappingBSubmissions:samples.filter(s=>s.overlap).length,
      totalActualPrivateEvents:backend.calls(),
      quietOverBudget,matchedQuietOverBudget,loadedOverBudget,
      medianQuietRatio:median(samples.map(s=>s.quietRatio)),
      medianMatchedQuietRatio:median(samples.map(s=>s.matchedQuietRatio)),
      medianLoadedRatio:median(samples.map(s=>s.loadedRatio)),
      maximumLoadedRatio:Math.max(...samples.map(s=>s.loadedRatio)),
      samples:samples.map(s=>({
        nativeBMs:Number(s.nativeBMs.toFixed(5)),
        quietBMs:Number(s.quietBMs.toFixed(5)),
        matchedQuietBMs:Number(s.matchedQuietBMs.toFixed(5)),
        loadedBMs:Number(s.loadedBMs.toFixed(5)),
        quietRatio:Number(s.quietRatio.toFixed(5)),
        matchedQuietRatio:Number(s.matchedQuietRatio.toFixed(5)),
        loadedRatio:Number(s.loadedRatio.toFixed(5)),
        aBusyMs:Number(s.aBusyMs.toFixed(5)),
        overlappingBSubmission:s.overlap
      })),
      scope:'Localhost single Node server main-thread synchronous HMAC load; not an isolated worker pool, measured WAN, or generic denial-of-service proof.'
    };
  }finally{
    fs.rmSync(folder,{recursive:true,force:true});
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  experiment().then(value=>process.stdout.write('SCO_CROSS_ACCOUNT_CONTENTION '+JSON.stringify(value)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment};
