'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {AsyncLocalStorage}=require('node:async_hooks');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoKeyedIsolation,createScoRpcClientSource}=require('../src');

const WORK=Buffer.alloc(8*1024*1024,0x5b);

/** @typedef {{seq:number,state:Buffer}} PrivateState */
/** @typedef {{status:number,value?:string,error?:string}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * A private, per-account stateful transition. No copy of root or transitions
 * is delivered by the generated client facade.
 * @param {Buffer} root
 * @returns {{advance:(principal:string,seq:number,input:string)=>string|null,
 *   expected:(principal:string)=>number}}
 */
function createPrivateMachine(root){
  /** @type {Map<string,PrivateState>} */
  const states=new Map();
  return {
    expected:principal=>states.get(principal)?.seq??0,
    advance:(principal,seq,input)=>{
      let record=states.get(principal);
      if(!record){
        record={seq:0,state:createHmac('sha256',root).update('ratchet-start-v1\0').update(principal).digest()};
        states.set(principal,record);
      }
      if(record.seq!==seq)return null;
      const next=createHmac('sha256',record.state)
        .update('ratchet-step-v1\0').update(principal).update('\0')
        .update(String(seq)).update('\0').update(input)
        .update(WORK).digest();
      record.state=next;
      record.seq++;
      return next.toString('hex');
    }
  };
}

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
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
 * @param {string|undefined} credential
 * @param {number} seq
 * @param {string} input
 * @param {unknown[]} [override]
 * @returns {Promise<Reply>}
 */
async function invoke(base,credential,seq,input,override){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(credential?{cookie:'session='+credential}:{})},
    body:JSON.stringify({method:'step',args:override??[seq,input]})
  });
  const payload=/** @type {{ok?:boolean,value?:string,error?:string}} */(await response.json());
  return {status:response.status,value:payload.value,error:payload.error};
}

/** @returns {Promise<object>} */
async function experiment(){
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const sessions=new Map([[tokenA,'account-A'],[tokenB,'account-B']]);
  const privateMachine=createPrivateMachine(root);
  const native=createPrivateMachine(root);
  const context=new AsyncLocalStorage();
  let privateExecutions=0;
  /** @param {http.IncomingMessage} request @returns {string|null} */
  function principalOf(request){
    const cookie=request.headers.cookie;
    const match=typeof cookie==='string'?/^session=([a-f0-9]{64})$/u.exec(cookie):null;
    return match?sessions.get(match[1])??null:null;
  }
  const keyed=createScoKeyedIsolation(request=>principalOf(request)??'unverified',{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const handler=createScoHandler([{
    path:'public.mjs',sourceType:'module',
    code:createScoRpcClientSource(['step'])
  }],{
    publicPaths:['public.mjs'],
    authorizeRead:request=>principalOf(request)!==null,
    authorizeRpc:request=>principalOf(request)!==null,
    authorizeOperation:(request,method,args)=>{
      const principal=principalOf(request);
      return principal!==null&&method==='step'&&args.length===2&&
        Number.isSafeInteger(args[0])&&typeof args[1]==='string'&&
        /^[a-f0-9]{64}$/u.test(args[1])&&
        args[0]===privateMachine.expected(principal);
    },
    runRpcIsolated:(request,execute)=>
      keyed(request,()=>context.run(principalOf(request),execute)),
    remoteMethods:{
      /** @param {number} seq @param {string} input @returns {Promise<string>} */
      step:async(seq,input)=>{
        const principal=context.getStore();
        if(typeof principal!=='string')throw new TypeError('Missing verified principal');
        const output=privateMachine.advance(principal,seq,input);
        if(output===null)throw new TypeError('Unexpected state transition');
        privateExecutions++;
        return output;
      }
    }
  });
  const trusted=await listen(handler);
  try{
    const unauthorizedSource=await fetch(trusted.base+'/obfs/public.mjs');
    assert.equal(unauthorizedSource.status,403);
    const published=await fetch(trusted.base+'/obfs/public.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(published.status,200);
    const source=await published.text();
    assert.doesNotMatch(source,/ratchet-step-v1|createHmac|privateMachine|8\*1024\*1024/u);
    assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));

    let ownMatches=0,crossMatches=0,replayDenials=0,
      malformedDenials=0,unauthorizedDenials=0;
    for(let index=0;index<32;index++){
      const input=challenge('held-out',index);
      const a=await invoke(trusted.base,tokenA,index,input);
      const b=await invoke(trusted.base,tokenB,index,input);
      assert.equal(a.status,200);
      assert.equal(b.status,200);
      if(a.value===native.advance('account-A',index,input))ownMatches++;
      assert.equal(b.value,native.advance('account-B',index,input));
      if(a.value===b.value)crossMatches++;
      if((await invoke(trusted.base,tokenA,index,input)).status===403)replayDenials++;
      if((await invoke(trusted.base,tokenA,index,input,[index,input,'account-B'])).status===403)malformedDenials++;
      if((await invoke(trusted.base,undefined,index,input)).status===403)unauthorizedDenials++;
    }
    assert.equal(ownMatches,32);
    assert.equal(crossMatches,0);
    assert.equal(replayDenials,32);
    assert.equal(malformedDenials,32);
    assert.equal(unauthorizedDenials,32);

    // Same-account online forwarding remains a complete functional clone.
    let forwardedMatches=0;
    for(let index=32;index<64;index++){
      const input=challenge('forwarded',index);
      const a=await invoke(trusted.base,tokenA,index,input);
      assert.equal(a.status,200);
      if(a.value===native.advance('account-A',index,input))forwardedMatches++;
    }
    assert.equal(forwardedMatches,32);
    // Two concurrent requests for an identical next sequence: exactly one
    // operation executes, while isolation makes the second policy see the
    // incremented state.
    const pairInput=challenge('duplicate',64);
    const pair=await Promise.all([
      invoke(trusted.base,tokenA,64,pairInput),
      invoke(trusted.base,tokenA,64,pairInput)
    ]);
    assert.deepEqual(pair.map(x=>x.status).sort((a,b)=>a-b),[200,403]);
    const actual=pair.find(x=>x.status===200);
    assert.equal(actual?.value,native.advance('account-A',64,pairInput));

    /** @type {Array<{count:number,nativeMs:number,remoteMs:number,ratio:number}>} */
    const samples=[];
    for(const count of [1,16,64]){
      for(let trial=0;trial<7;trial++){
        const principal='profile-'+count+'-'+trial;
        const token=randomBytes(32).toString('hex');
        sessions.set(token,principal);
        const local=createPrivateMachine(root);
        const localTime=()=>{
          const start=performance.now();
          for(let index=0;index<count;index++){
            assert.equal(typeof local.advance(principal,index,challenge('profile',index)),'string');
          }
          return performance.now()-start;
        };
        const remoteTime=async()=>{
          const start=performance.now();
          for(let index=0;index<count;index++){
            const response=await invoke(trusted.base,token,index,challenge('profile',index));
            assert.equal(response.status,200);
          }
          return performance.now()-start;
        };
        let nativeMs,remoteMs;
        if(trial%2===0){
          nativeMs=localTime();
          remoteMs=await remoteTime();
        }else{
          remoteMs=await remoteTime();
          nativeMs=localTime();
        }
        samples.push({count,nativeMs,remoteMs,ratio:remoteMs/nativeMs});
      }
    }
    const budgets=[1,16,64].map(count=>{
      const pairs=samples.filter(row=>row.count===count);
      return {count,trials:pairs.length,medianRatio:median(pairs.map(row=>row.ratio)),
        maximumRatio:Math.max(...pairs.map(row=>row.ratio)),
        overBudgetPairs:pairs.filter(row=>row.ratio>2.5).length};
    });
    return {
      platform:process.platform,node:process.version,
      publishedSourceSha256:createHash('sha256').update(source).digest('hex'),
      publishedSourceBytes:Buffer.byteLength(source),
      protectedWorkBytesPerCall:WORK.length,
      ownAccountMatched:ownMatches,
      heldoutCrossAccountCollisions:crossMatches,
      replayDenials,malformedDenials,unauthorizedDenials,
      sameAccountForwardedMatches:forwardedMatches,
      concurrentDuplicateStatuses:pair.map(x=>x.status).sort((a,b)=>a-b),
      privateExecutions,budgets,
      sampledBudgetVerdict:budgets.some(row=>row.overBudgetPairs>0)?'blocked':'no-observed-breach',
      limitation:'Localhost, no TLS/RTT; A or B credential holders can relay their own calls. Account trust and server state provide the boundary.'
    };
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>trusted.server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_RATCHET_RESULT '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment,createPrivateMachine};
