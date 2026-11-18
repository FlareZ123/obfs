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
 * Conventional authenticated JSON RPC with the original private machine.
 * Uses the identical cookie and batch shape as the protected endpoint, plus
 * the same A-start/A-end timing instrumentation. No facade/compiler involved.
 * @param {Buffer} root
 * @param {number} _delayMs
 * @param {string|undefined} _facade
 * @param {(principal:string,start:number)=>void} [onStart]
 * @param {(principal:string,start:number)=>void} [onEnd]
 * @returns {{handler:http.RequestListener,grant:(token:string,principal:string)=>void,calls:()=>number}}
 */
function makeConventionalServer(root,_delayMs,_facade,onStart,onEnd){
  /** @type {Map<string,string>} */
  const sessions=new Map();
  const machine=createPrivateMachine(root);
  let executed=0;
  /** @type {http.RequestListener} */
  const handler=(request,response)=>{
    /** @param {number} status @param {object} payload @returns {void} */
    function reply(status,payload){
      response.writeHead(status,{'content-type':'application/json'});
      response.end(JSON.stringify(payload));
    }
    if(request.method!=='POST'||request.url!=='/obfs/rpc'){
      reply(404,{ok:false});return;
    }
    const cookie=request.headers.cookie;
    const match=typeof cookie==='string'?/^session=([a-f0-9]{64})$/u.exec(cookie):null;
    const principal=match?sessions.get(match[1]):undefined;
    if(principal===undefined){reply(403,{ok:false});return;}
    /** @type {Buffer[]} */
    const chunks=[];
    let bytes=0;
    request.on('data',/** @param {Buffer} chunk */chunk=>{
      bytes+=chunk.length;
      if(bytes<=32768)chunks.push(chunk);
    });
    request.on('end',()=>{
      if(bytes>32768){reply(413,{ok:false});return;}
      /** @type {unknown} */
      let body;
      try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch{reply(400,{ok:false});return;}
      if(!body||typeof body!=='object'||Array.isArray(body)||
        !('method' in body)||body.method!=='batch'||
        !('args' in body)||!Array.isArray(body.args)||body.args.length!==2){
        reply(403,{ok:false});return;
      }
      const [start,inputs]=body.args;
      if(!Number.isSafeInteger(start)||start!==machine.expected(principal)||
        !Array.isArray(inputs)||inputs.length<1||inputs.length>64||
        !inputs.every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value))){
        reply(403,{ok:false});return;
      }
      onStart?.(principal,start);
      /** @type {string[]} */
      const outputs=[];
      for(let i=0;i<inputs.length;i++){
        const value=machine.advance(principal,start+i,inputs[i]);
        if(value===null)throw new Error('Original state transition mismatch');
        outputs.push(value);
        executed++;
      }
      onEnd?.(principal,start);
      reply(200,{ok:true,value:outputs});
    });
  };
  return {handler,grant:(token,principal)=>{sessions.set(token,principal);},calls:()=>executed};
}

/**
 * Reproduce the prompt's A-unlimited-legitimate-requests threat against
 * per-principal isolation in a single Node event loop. Source A and B keys
 * and principals remain distinct. The child process starts B while trusted
 * Node is synchronously processing A's private HMAC batch.
 * @param {'generated'|'conventional'} mode
 * @param {number} [trials]
 * @param {number} [firstTrial]
 * @param {Buffer} [root]
 */
async function experiment(mode,trials=7,firstTrial=0,root=randomBytes(32)){
  /** @type {Trial|null} */
  let current=null;
  const makeBackend=mode==='generated'?makeServer:makeConventionalServer;
  const backend=makeBackend(root,0,undefined,
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
    for(let trial=firstTrial;trial<firstTrial+trials;trial++){
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
    assert.equal(samples.length,trials);
    assert.equal(backend.calls(),trials*(16+16+64+16));
    const loadedOverBudget=samples.filter(s=>s.loadedRatio>2.5).length;
    const quietOverBudget=samples.filter(s=>s.quietRatio>2.5).length;
    const matchedQuietOverBudget=samples.filter(s=>s.matchedQuietRatio>2.5).length;
    return {
      experiment:'Authenticated A private HMAC burst blocks B under the selected equally trusted server',
      mode,
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


/**
 * Match ordinary authenticated private HMAC RPC against generated SCO RPC,
 * both under genuine independently launched, A-contended B HTTP requests.
 * Unlike unloaded-original denominators, this isolates the incremental
 * overhead of the protected handler under the same original A/B work.
 * @returns {Promise<object>}
 */

/**
 * Combine exact independent one-trial server results without inventing
 * arbitrary performance ratios from an unloaded original.
 * @param {Array<Awaited<ReturnType<typeof experiment>>>} runs
 * @param {'generated'|'conventional'} mode
 */
function aggregate(runs,mode){
  const samples=runs.flatMap(row=>row.samples);
  assert.equal(samples.length,7);
  return {
    mode,platform:process.platform,node:process.version,
    hashRootBytes:32,privateWorkBytesPerEvent:8388608,
    attackerEventsPerTrial:64,victimEventsPerTrial:16,quietEventsPerTrial:16,
    independentChildProcess:true,statusCodesAll200:true,
    totalActualPrivateEvents:runs.reduce((count,row)=>count+row.totalActualPrivateEvents,0),
    overlappingBSubmissions:runs.reduce((count,row)=>count+row.overlappingBSubmissions,0),
    quietOverBudget:samples.filter(row=>row.quietRatio>2.5).length,
    matchedQuietOverBudget:samples.filter(row=>row.matchedQuietRatio>2.5).length,
    loadedOverBudget:samples.filter(row=>row.loadedRatio>2.5).length,
    medianQuietRatio:median(samples.map(row=>row.quietRatio)),
    medianMatchedQuietRatio:median(samples.map(row=>row.matchedQuietRatio)),
    medianLoadedRatio:median(samples.map(row=>row.loadedRatio)),
    maximumLoadedRatio:Math.max(...samples.map(row=>row.loadedRatio)),
    samples
  };
}

/**
 * Alternating crossover arms, with a separate one-trial server for each
 * arm and the same fresh private root for a trial's pair. Preserve exact
 * A/B session state and independent B timing proofs in both arms.
 * @returns {Promise<object>}
 */
async function compare(){
  /** @type {Array<Awaited<ReturnType<typeof experiment>>>} */
  const conventionalRuns=[],generatedRuns=[];
  for(let trial=0;trial<7;trial++){
    const root=randomBytes(32);
    if(trial%2===0){
      conventionalRuns.push(await experiment('conventional',1,trial,root));
      generatedRuns.push(await experiment('generated',1,trial,root));
    }else{
      generatedRuns.push(await experiment('generated',1,trial,root));
      conventionalRuns.push(await experiment('conventional',1,trial,root));
    }
  }
  const conventional=aggregate(conventionalRuns,'conventional');
  const generated=aggregate(generatedRuns,'generated');
  assert.equal(conventional.totalActualPrivateEvents,784);
  assert.equal(generated.totalActualPrivateEvents,784);
  assert.equal(conventional.overlappingBSubmissions,7);
  assert.equal(generated.overlappingBSubmissions,7);
  const paired=conventional.samples.map((row,index)=>({
    trial:index+1,conventionalLoadedBMs:row.loadedBMs,
    generatedLoadedBMs:generated.samples[index].loadedBMs,
    loadedGeneratedVsConventional:generated.samples[index].loadedBMs/row.loadedBMs,
    quietGeneratedVsConventional:generated.samples[index].matchedQuietBMs/row.matchedQuietBMs
  }));
  return {
    experiment:'Alternating same-root equal-trust conventional versus generated SCO A-contended B HTTP',
    platform:process.platform,node:process.version,
    conventional,generated,matchedLoadedPairs:paired,
    medianLoadedGeneratedVsConventional:median(paired.map(row=>row.loadedGeneratedVsConventional)),
    strictIncrementalOverBudget:paired.filter(row=>row.loadedGeneratedVsConventional>2.5).length,
    armOrder:'conventional-generated,generated-conventional (repeated), same root per trial',
    scope:'7 alternating crossover pairs on fresh conventional and generated trusted HTTP servers. Same original HMAC, private root per pair, authorization, independent cold B and real A/B overlap. No TLS/WAN, worker scheduling, or universal latency/compute claim.'
  };
}

if(require.main===module){
  compare().then(result=>process.stdout.write('SCO_EQUAL_TRUST_CONTENTION '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={compare,experiment,makeConventionalServer};
