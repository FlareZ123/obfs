'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {AsyncLocalStorage}=require('node:async_hooks');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoKeyedIsolation,createScoRpcClientSource}=require('../src');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeServer}=require('./sco-ratchet-batch-candidate');

/** @typedef {{status:number,value?:string[]}} Reply */
/** @typedef {{start:number,digest:string,length:number,outputs:string[]}} Memo */

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('retry-event/'+index).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {string[]} inputs @returns {string} */
function fingerprint(inputs){
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

/**
 * Idempotent last-batch cache lives on a trusted SCO server and is isolated
 * by authenticated identity. Each accepted next-sequence batch executes
 * private work exactly once. A byte-identical replay can recover the original
 * response after a lost HTTP response without advancing state a second time.
 *
 * @param {Buffer} key
 * @param {number} delayMs
 * @returns {{handler:http.RequestListener,grant:(token:string,principal:string)=>void,
 *   calls:()=>number,hits:()=>number}}
 */
function makeIdempotentServer(key,delayMs){
  const machine=createPrivateMachine(key);
  /** @type {Map<string,Memo>} */
  const last=new Map();
  /** @type {Map<string,string>} */
  const sessions=new Map();
  const context=new AsyncLocalStorage();
  let executions=0;
  let hits=0;
  /** @param {http.IncomingMessage} request @returns {string|null} */
  function principalOf(request){
    const cookie=request.headers.cookie;
    const match=typeof cookie==='string'?/^session=([a-f0-9]{64})$/u.exec(cookie):null;
    return match?sessions.get(match[1])??null:null;
  }
  const isolated=createScoKeyedIsolation(req=>principalOf(req)??'unverified',{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const handler=createScoHandler([{
    path:'batch.mjs',sourceType:'module',code:createScoRpcClientSource(['batch'])
  }],{
    publicPaths:['batch.mjs'],
    authorizeRead:req=>principalOf(req)!==null,
    authorizeRpc:req=>principalOf(req)!==null,
    authorizeOperation:(req,method,args)=>{
      const principal=principalOf(req);
      if(principal===null||method!=='batch'||args.length!==2||
         !Number.isSafeInteger(args[0])||!Array.isArray(args[1]))return false;
      const start=/** @type {number} */(args[0]);
      const inputs=/** @type {unknown[]} */(args[1]);
      if(inputs.length<1||inputs.length>64||
         !inputs.every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value))){
        return false;
      }
      const remembered=last.get(principal);
      const sameBatch=remembered!==undefined&&remembered.start===start&&
        remembered.length===inputs.length&&
        remembered.digest===fingerprint(/** @type {string[]} */(inputs));
      return machine.expected(principal)===start||sameBatch;
    },
    runRpcIsolated:(req,execute)=>isolated(req,async()=>{
      if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
      await context.run(principalOf(req),execute);
    }),
    remoteMethods:{
      /**
       * @param {number} start
       * @param {string[]} inputs
       * @returns {string[]}
       */
      batch:(start,inputs)=>{
        const principal=context.getStore();
        if(typeof principal!=='string')throw new TypeError('Missing verified principal');
        const digest=fingerprint(inputs);
        const remembered=last.get(principal);
        if(remembered&&remembered.start===start&&
           remembered.length===inputs.length&&remembered.digest===digest){
          hits++;
          return [...remembered.outputs];
        }
        if(machine.expected(principal)!==start){
          throw new TypeError('Unrecognized ratchet sequence');
        }
        /** @type {string[]} */
        const results=[];
        for(let offset=0;offset<inputs.length;offset++){
          const result=machine.advance(principal,start+offset,inputs[offset]);
          if(result===null)throw new TypeError('Invalid internal ratchet step');
          results.push(result);
          executions++;
        }
        last.set(principal,{start,digest,length:inputs.length,outputs:[...results]});
        return results;
      }
    }
  });
  return {handler,grant:(token,principal)=>{sessions.set(token,principal);},
    calls:()=>executions,hits:()=>hits};
}

/**
 * @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,url:string}>}
 */
async function listen(handler){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,url:'http://127.0.0.1:'+address.port};
}

/**
 * @param {string} url
 * @param {string|undefined} token
 * @param {number} start
 * @param {string[]} inputs
 * @returns {Promise<Reply>}
 */
async function call(url,token,start,inputs){
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:[start,inputs]})
  });
  const payload=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:payload.value};
}

/**
 * Deliberately lose a successful upstream response after its server-side
 * private work has committed. The downstream user sees 502 but cannot
 * distinguish this case from a failure before execution.
 *
 * @param {string} upstream
 * @param {string} token
 * @returns {http.RequestListener}
 */
function dropSuccessfulResponse(upstream,token){
  return (request,response)=>{
    if(request.method!=='POST'||request.url!=='/rpc'){
      response.writeHead(404).end();return;
    }
    void (async()=>{
      /** @type {Buffer[]} */
      const chunks=[];
      let size=0;
      for await(const chunk of request){
        size+=chunk.length;
        if(size>65536){response.writeHead(413).end();return;}
        chunks.push(chunk);
      }
      const upstreamReply=await fetch(upstream,{
        method:'POST',
        headers:{'content-type':'application/json',cookie:'session='+token},
        body:Buffer.concat(chunks)
      });
      // Force the physical upstream request to complete, committing private
      // work, then deliberately throw away its otherwise valid response.
      await upstreamReply.text();
      assert.equal(upstreamReply.status,200);
      response.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});
      response.end('{"ok":false,"error":"Upstream result lost after commit"}');
    })().catch(()=>{
      if(!response.headersSent)response.writeHead(500).end('{"ok":false}');
      else response.destroy();
    });
  };
}

/**
 * @param {Buffer} root
 * @param {0|25} delay
 * @returns {Promise<object>}
 */
async function profile(root,delay){
  const repaired=makeIdempotentServer(root,delay);
  const server=await listen(repaired.handler);
  try{
    /** @type {{count:number,ratio:number}[]} */
    const samples=[];
    for(const count of [1,4,16,64]){
      for(let trial=0;trial<7;trial++){
        const principal='profile-'+delay+'-'+count+'-'+trial;
        const token=randomBytes(32).toString('hex');
        repaired.grant(token,principal);
        const original=createPrivateMachine(root);
        const inputs=Array.from({length:count},(_,index)=>challenge(index));
        /** @type {string[]} */
        let expected=[];
        /** @type {string[]|undefined} */
        let actual;
        const nativeTime=()=>{
          const started=performance.now();
          expected=inputs.map((value,index)=>{
            const result=original.advance(principal,index,value);
            assert.equal(typeof result,'string');
            return /** @type {string} */(result);
          });
          return performance.now()-started;
        };
        const remoteTime=async()=>{
          const started=performance.now();
          const response=await call(server.url+'/obfs/rpc',token,0,inputs);
          assert.equal(response.status,200);
          actual=response.value;
          return performance.now()-started;
        };
        let nativeMs,remoteMs;
        if(trial%2===0){nativeMs=nativeTime();remoteMs=await remoteTime();}
        else{remoteMs=await remoteTime();nativeMs=nativeTime();}
        assert.deepEqual(actual,expected);
        samples.push({count,ratio:remoteMs/nativeMs});
      }
    }
    return {delayMs:delay,budgets:[1,4,16,64].map(count=>{
      const group=samples.filter(x=>x.count===count);
      return {count,trials:group.length,
        medianRatio:median(group.map(x=>x.ratio)),
        maxRatio:Math.max(...group.map(x=>x.ratio)),
        strictOverBudgetPairs:group.filter(x=>x.ratio>2.5).length,
        pairedRatios:group.map(x=>Number(x.ratio.toFixed(5)))};
    })};
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const root=randomBytes(32);
  const inputs=[challenge(0),challenge(1)];
  const tokenA=randomBytes(32).toString('hex');
  const strict=makeServer(root,0);
  strict.grant(tokenA,'A');
  const strictServer=await listen(strict.handler);
  const strictLoss=await listen(dropSuccessfulResponse(strictServer.url+'/obfs/rpc',tokenA));
  let strictResult;
  try{
    const lost=await call(strictLoss.url+'/rpc',undefined,0,inputs);
    assert.equal(lost.status,502);
    assert.equal(strict.calls(),2);
    const retry=await call(strictServer.url+'/obfs/rpc',tokenA,0,inputs);
    assert.equal(retry.status,403);
    assert.equal(strict.calls(),2);
    strictResult={responseAfterCommit:lost.status,retryStatus:retry.status,
      privateExecutions:strict.calls()};
  }finally{
    /** @type {Promise<void>} */
    const closeLoss=new Promise((resolve,reject)=>
      strictLoss.server.close(error=>error?reject(error):resolve()));
    await closeLoss;
    /** @type {Promise<void>} */
    const closeServer=new Promise((resolve,reject)=>
      strictServer.server.close(error=>error?reject(error):resolve()));
    await closeServer;
  }

  const repaired=makeIdempotentServer(root,0);
  repaired.grant(tokenA,'A');
  const tokenB=randomBytes(32).toString('hex');
  repaired.grant(tokenB,'B');
  const trusted=await listen(repaired.handler);
  const blackhole=await listen(dropSuccessfulResponse(trusted.url+'/obfs/rpc',tokenA));
  let repairedResult;
  try{
    const sourceResponse=await fetch(trusted.url+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(sourceResponse.status,200);
    const source=await sourceResponse.text();
    assert.doesNotMatch(source,/createHmac|createPrivateMachine|ratchet-step-v1/u);
    assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));
    const lost=await call(blackhole.url+'/rpc',undefined,0,inputs);
    assert.equal(lost.status,502);
    assert.equal(repaired.calls(),2);
    const exact=await call(trusted.url+'/obfs/rpc',tokenA,0,inputs);
    assert.equal(exact.status,200);
    const expected=createPrivateMachine(root);
    assert.deepEqual(exact.value,inputs.map((value,index)=>
      expected.advance('A',index,value)));
    assert.equal(repaired.calls(),2);
    assert.equal(repaired.hits(),1);
    const changed=await call(trusted.url+'/obfs/rpc',tokenA,0,[challenge(9),inputs[1]]);
    assert.equal(changed.status,403);
    assert.equal(repaired.calls(),2);
    const nextInputs=[challenge(2),challenge(3)];
    const duplicate=await Promise.all([
      call(trusted.url+'/obfs/rpc',tokenA,2,nextInputs),
      call(trusted.url+'/obfs/rpc',tokenA,2,nextInputs)
    ]);
    assert.deepEqual(duplicate.map(x=>x.status).sort((a,b)=>a-b),[200,200]);
    const expectedNext=nextInputs.map((value,index)=>
      expected.advance('A',2+index,value));
    for(const item of duplicate)assert.deepEqual(item.value,expectedNext);
    assert.equal(repaired.calls(),4);
    assert.equal(repaired.hits(),2);
    assert.equal((await call(trusted.url+'/obfs/rpc',tokenA,0,inputs)).status,403);
    assert.equal((await call(trusted.url+'/obfs/rpc',undefined,0,inputs)).status,403);
    const b=await call(trusted.url+'/obfs/rpc',tokenB,0,inputs);
    assert.equal(b.status,200);
    const expectedB=createPrivateMachine(root);
    assert.deepEqual(b.value,inputs.map((value,index)=>
      expectedB.advance('B',index,value)));
    assert.notDeepEqual(b.value,exact.value);
    repairedResult={
      lostResponseStatus:lost.status,
      exactRetryStatus:exact.status,modifiedRetryStatus:changed.status,
      concurrentDuplicateStatuses:duplicate.map(x=>x.status).sort((a,b)=>a-b),
      oldRetryAfterNewBatchStatus:403,
      unauthenticatedStatus:403,
      privateExecutions:repaired.calls(),cacheHits:repaired.hits(),
      sourceSha256:createHash('sha256').update(source).digest('hex'),
      sourceBytes:Buffer.byteLength(source),oneEntryPerAccount:true
    };
  }finally{
    /** @type {Promise<void>} */
    const closeLoss=new Promise((resolve,reject)=>
      blackhole.server.close(error=>error?reject(error):resolve()));
    await closeLoss;
    /** @type {Promise<void>} */
    const closeServer=new Promise((resolve,reject)=>
      trusted.server.close(error=>error?reject(error):resolve()));
    await closeServer;
  }
  const budgets=[await profile(root,0),await profile(root,25)];
  return {
    platform:process.platform,node:process.version,
    baselineStrictRatchet:strictResult,
    idempotentRepair:repairedResult,
    privateWorkBytesPerEvent:8388608,
    performance:budgets,
    caveat:'Trusted server only. Cache has one-entry per principal; A-account online relay remains possible. Simulated response loss and 25ms delay are not production network measurements.'
  };
}

if(require.main===module){
  experiment().then(value=>process.stdout.write('SCO_RATCHET_RETRY_RESULT '+JSON.stringify(value)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment,makeIdempotentServer,dropSuccessfulResponse};
