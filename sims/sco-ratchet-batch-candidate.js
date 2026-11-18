'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {AsyncLocalStorage}=require('node:async_hooks');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler,createScoKeyedIsolation,createScoRpcClientSource}=require('../src');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{status:number,value?:string[],error?:string}} Reply */

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/** @param {number[]} times @returns {number} */
function median(times){
  const sorted=[...times].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {Buffer} key
 * @param {number} delayMs
 * @param {string} [publicFacadeSource] Optional equal-trust public-facade control.
 * @param {(principal:string,start:number,inputs:string[])=>void} [onBatchStart] Test-only
 *   observation hook before synchronous private work; cannot authorize work.
 * @param {(principal:string,start:number,inputs:string[])=>void} [onBatchEnd] Test-only
 *   observation hook after synchronous private work; cannot authorize work.
 * @returns {{handler:http.RequestListener,grant:(token:string,principal:string)=>void,
 *    calls:()=>number}}
 */
function makeServer(key,delayMs,publicFacadeSource,onBatchStart,onBatchEnd){
  const sessions=new Map();
  const machine=createPrivateMachine(key);
  const context=new AsyncLocalStorage();
  let executed=0;
  /** @param {http.IncomingMessage} request @returns {string|null} */
  function principalOf(request){
    const cookie=request.headers.cookie;
    const match=typeof cookie==='string'?/^session=([a-f0-9]{64})$/u.exec(cookie):null;
    return match?sessions.get(match[1])??null:null;
  }
  const isolation=createScoKeyedIsolation(request=>principalOf(request)??'unverified',{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const handler=createScoHandler([{
    path:'batch.mjs',sourceType:'module',
    code:publicFacadeSource??createScoRpcClientSource(['batch'])
  }],{
    publicPaths:['batch.mjs'],
    authorizeRead:request=>principalOf(request)!==null,
    authorizeRpc:request=>principalOf(request)!==null,
    authorizeOperation:(request,method,args)=>{
      const principal=principalOf(request);
      if(principal===null||method!=='batch'||args.length!==2||
         !Number.isSafeInteger(args[0])||!Array.isArray(args[1]))return false;
      const seq=/** @type {number} */(args[0]);
      const inputs=/** @type {unknown[]} */(args[1]);
      return seq===machine.expected(principal)&&inputs.length>=1&&inputs.length<=64&&
        inputs.every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value));
    },
    runRpcIsolated:(request,execute)=>
      isolation(request,async()=>{
        // Artificial one-way service delay per request, not a real RTT or TLS
        // observation. It is deliberately included inside the measured RPC.
        if(delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));
        await context.run(principalOf(request),execute);
      }),
    remoteMethods:{
      /**
       * @param {number} start
       * @param {string[]} inputs
       * @returns {Promise<string[]>}
       */
      batch:async(start,inputs)=>{
        const principal=context.getStore();
        if(typeof principal!=='string')throw new TypeError('Missing authenticated principal');
        onBatchStart?.(principal,start,inputs);
        /** @type {string[]} */
        const outputs=[];
        for(let i=0;i<inputs.length;i++){
          const value=machine.advance(principal,start+i,inputs[i]);
          if(value===null)throw new TypeError('Private state transition declined');
          outputs.push(value);
          executed++;
        }
        onBatchEnd?.(principal,start,inputs);
        return outputs;
      }
    }
  });
  return {handler,grant:(token,principal)=>{sessions.set(token,principal);},calls:()=>executed};
}

/**
 * @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,base:string}>}
 */
async function listen(handler){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,base:'http://127.0.0.1:'+address.port};
}

/**
 * @param {string} base
 * @param {string|undefined} token
 * @param {number} seq
 * @param {string[]} inputs
 * @param {unknown[]} [override]
 * @returns {Promise<Reply>}
 */
async function call(base,token,seq,inputs,override){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:override??[seq,inputs]})
  });
  const result=/** @type {{ok?:boolean,value?:string[],error?:string}} */(await response.json());
  return {status:response.status,value:result.value,error:result.error};
}

/**
 * @param {Buffer} key
 * @param {number} delayMs
 * @returns {Promise<object>}
 */
async function profile(key,delayMs){
  const backend=makeServer(key,delayMs);
  const trusted=await listen(backend.handler);
  try{
    const tokenA=randomBytes(32).toString('hex');
    const tokenB=randomBytes(32).toString('hex');
    backend.grant(tokenA,'A');
    backend.grant(tokenB,'B');
    assert.equal((await fetch(trusted.base+'/obfs/batch.mjs')).status,403);
    const sourceResponse=await fetch(trusted.base+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(sourceResponse.status,200);
    const source=await sourceResponse.text();
    assert.doesNotMatch(source,/createPrivateMachine|ratchet-step-v1|createHmac/u);
    assert.doesNotMatch(source,new RegExp(key.toString('hex'),'u'));
    // Independent public-facade runtime attacker operates with A-only access.
    // B is verified separately with its own credential and original machine.
    const tokenAttackerA=randomBytes(32).toString('hex');
    const tokenTargetB=randomBytes(32).toString('hex');
    backend.grant(tokenAttackerA,'attacker-A');
    backend.grant(tokenTargetB,'target-B');
    const child=await promisify(execFile)(process.execPath,[
      require.resolve('./sco-ratchet-batch-public-attacker'),
      trusted.base,tokenAttackerA
    ],{timeout:60000,maxBuffer:1024*1024});
    const attack=/** @type {{publicSha256:string,outputs:string[]}} */
      (JSON.parse(child.stdout));
    assert.equal(attack.publicSha256,createHash('sha256').update(source).digest('hex'));
    const attackInputs=Array.from({length:32},(_,index)=>challenge(index));
    const independentNative=createPrivateMachine(key);
    const expectedAttacker=attackInputs.map((value,index)=>
      independentNative.advance('attacker-A',index,value));
    assert.deepEqual(attack.outputs,expectedAttacker);
    const target=await call(trusted.base,tokenTargetB,0,attackInputs);
    assert.equal(target.status,200);
    const expectedTarget=attackInputs.map((value,index)=>
      independentNative.advance('target-B',index,value));
    assert.deepEqual(target.value,expectedTarget);
    const crossAccountMatches=attack.outputs.filter((value,index)=>
      value===target.value?.[index]).length;
    assert.equal(crossAccountMatches,0);

    const native=createPrivateMachine(key);
    const initialInputs=[challenge(0),challenge(1),challenge(2)];
    const a=await call(trusted.base,tokenA,0,initialInputs);
    const b=await call(trusted.base,tokenB,0,initialInputs);
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    const nativeA=initialInputs.map((value,i)=>native.advance('A',i,value));
    const nativeB=initialInputs.map((value,i)=>native.advance('B',i,value));
    assert.deepEqual(a.value,nativeA);
    assert.deepEqual(b.value,nativeB);
    assert.notDeepEqual(a.value,b.value);
    assert.equal((await call(trusted.base,tokenA,0,initialInputs)).status,403);
    assert.equal((await call(trusted.base,tokenA,3,initialInputs,
      [3,initialInputs,'B'])).status,403);
    assert.equal((await call(trusted.base,undefined,3,initialInputs)).status,403);
    // The next 2-event batch is sent twice concurrently for the same
    // authenticated account. The lock and policy must admit exactly one.
    const pairInputs=[challenge(3),challenge(4)];
    const duplicate=await Promise.all([
      call(trusted.base,tokenA,3,pairInputs),
      call(trusted.base,tokenA,3,pairInputs)
    ]);
    assert.deepEqual(duplicate.map(row=>row.status).sort((x,y)=>x-y),[200,403]);
    assert.deepEqual(duplicate.find(row=>row.status===200)?.value,
      pairInputs.map((value,i)=>native.advance('A',3+i,value)));

    /** @type {Array<{count:number,nativeMs:number,remoteMs:number,ratio:number}>} */
    const samples=[];
    for(const count of [1,4,16,64]){
      for(let trial=0;trial<7;trial++){
        const principal='profile-'+delayMs+'-'+count+'-'+trial;
        const token=randomBytes(32).toString('hex');
        backend.grant(token,principal);
        const local=createPrivateMachine(key);
        const inputs=Array.from({length:count},(_,index)=>challenge(index));
        /** @type {string[]} */
        let nativeOutputs=[];
        /** @type {string[]} */
        let remoteOutputs=[];
        const localTime=()=>{
          const start=performance.now();
          nativeOutputs=inputs.map((value,index)=>{
            const result=local.advance(principal,index,value);
            assert.equal(typeof result,'string');
            return /** @type {string} */(result);
          });
          return performance.now()-start;
        };
        const remoteTime=async()=>{
          const start=performance.now();
          const response=await call(trusted.base,token,0,inputs);
          assert.equal(response.status,200);
          remoteOutputs=/** @type {string[]} */(response.value);
          return performance.now()-start;
        };
        let nativeMs,remoteMs;
        if(trial%2===0){nativeMs=localTime();remoteMs=await remoteTime();}
        else{remoteMs=await remoteTime();nativeMs=localTime();}
        assert.deepEqual(remoteOutputs,nativeOutputs);
        samples.push({count,nativeMs,remoteMs,ratio:remoteMs/nativeMs});
      }
    }
    const budgets=[1,4,16,64].map(count=>{
      const pairs=samples.filter(row=>row.count===count);
      return {count,trials:pairs.length,
        medianRatio:median(pairs.map(row=>row.ratio)),
        maxRatio:Math.max(...pairs.map(row=>row.ratio)),
        overBudgetPairs:pairs.filter(row=>row.ratio>2.5).length,
        pairedRatios:pairs.map(row=>Number(row.ratio.toFixed(5)))};
    });
    return {
      platform:process.platform,node:process.version,delayMs,
      publishedSourceSha256:createHash('sha256').update(source).digest('hex'),
      publishedBytes:Buffer.byteLength(source),
      secretBytes:32,privateWorkBytesPerEvent:8*1024*1024,
      nativeOutputParity:true,accountSeparation:true,
      independentAOnlyBatchMatches:attack.outputs.length,
      independentCrossAccountMatches:crossAccountMatches,
      staleReplayStatus:403,malformedOverrideStatus:403,
      unauthenticatedStatus:403,concurrentDuplicateStatuses:[200,403],
      privateExecutions:backend.calls(),budgets,
      supported16And64Pass:budgets.filter(row=>row.count>=16)
        .every(row=>row.overBudgetPairs===0),
      universalOneEventPass:budgets.find(row=>row.count===1)?.overBudgetPairs===0
    };
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      trusted.server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const key=randomBytes(32);
  const zero=await profile(key,0);
  const surrogate=await profile(key,25);
  return {candidate:'SCO atomic 8MiB HMAC ratchet batching',
    tested:[zero,surrogate],
    caveat:'25ms per-request delay is synthetic; actual RTT, TLS, browsers and an independently developed B-target attack are unmeasured. B-credential online relay remains viable.'};
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_RATCHET_BATCH_RESULT '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment,makeServer};
