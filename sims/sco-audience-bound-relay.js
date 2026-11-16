'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {AsyncLocalStorage}=require('node:async_hooks');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoKeyedIsolation,createScoRpcClientSource}=require('../src');

/** @typedef {{status:number,ok:boolean,value:string|undefined}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex').slice(0,32);
}

/** @param {number[]} values @returns {number} */
function median(values){
  return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
}

/**
 * @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,url:string}>}
 */
async function listen(handler){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,url:'http://127.0.0.1:'+address.port};
}

/**
 * @param {string} url
 * @param {string} input
 * @param {string|undefined} [token]
 * @param {unknown[]} [args]
 * @returns {Promise<Reply>}
 */
async function invoke(url,input,token,args=[input]){
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{'x-session':token}:{})},
    body:JSON.stringify({method:'derive',args})
  });
  const data=/** @type {{ok:boolean,value?:string}} */(await response.json());
  return {status:response.status,ok:data.ok,value:data.value};
}

/**
 * This adversary owns only account A's valid bearer and the public RPC URL.
 * A client asking it for account B's result receives account A's digest.
 * @param {string} endpoint
 * @param {string} attackToken
 * @returns {http.RequestListener}
 */
function attackerRelay(endpoint,attackToken){
  return (request,response)=>{
    if(request.method!=='POST'||request.url!=='/rpc'){
      response.writeHead(404).end();
      return;
    }
    void (async()=>{
      /** @type {Buffer[]} */
      const chunks=[];
      let bytes=0;
      for await(const chunk of request){
        bytes+=chunk.length;
        if(bytes>65536){response.writeHead(413).end();return;}
        chunks.push(chunk);
      }
      const upstream=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json','x-session':attackToken},
        body:Buffer.concat(chunks)
      });
      response.writeHead(upstream.status,{
        'content-type':'application/json','cache-control':'no-store'
      });
      response.end(await upstream.text());
    })().catch(()=>{
      if(!response.headersSent)response.writeHead(502).end();
      else response.destroy();
    });
  };
}

/**
 * A two-account security game. Honest B must possess B's separate credential;
 * the attacker may make unlimited authorized A calls, but has no B token.
 * Nothing prevents A from relaying its own account A behavior online.
 * @returns {Promise<object>}
 */
async function experiment(){
  const key=randomBytes(32);
  const work=Buffer.alloc(8*1024*1024,0x5a);
  const sessionA=randomBytes(32).toString('hex');
  const sessionB=randomBytes(32).toString('hex');
  const principals=new Map([[sessionA,'account-A'],[sessionB,'account-B']]);
  const context=new AsyncLocalStorage();
  let privateExecutions=0;

  /** @param {string} principal @param {string} input @returns {string} */
  function native(principal,input){
    return createHmac('sha256',key).update('bound-rpc-v1\0')
      .update(principal).update('\0').update(input).update(work).digest('hex');
  }
  /** @param {http.IncomingMessage} request @returns {string} */
  function identityOf(request){
    const bearer=request.headers['x-session'];
    return typeof bearer==='string' ? principals.get(bearer)??'unverified' : 'unverified';
  }
  const isolate=createScoKeyedIsolation(identityOf,{maxPendingPerPrincipal:4});
  /** @type {http.RequestListener} */
  const handler=createScoHandler([{
    path:'remote.mjs',sourceType:'module',
    code:createScoRpcClientSource(['derive'])
  }],{
    publicPaths:['remote.mjs'],
    authorizeRead:request=>identityOf(request)!=='unverified',
    authorizeRpc:request=>identityOf(request)!=='unverified',
    authorizeOperation:(request,method,args)=>identityOf(request)!=='unverified' &&
      method==='derive' && args.length===1 && typeof args[0]==='string' &&
      /^[a-f0-9]{32}$/u.test(args[0]),
    runRpcIsolated:(request,execute)=>
      isolate(request,()=>context.run(identityOf(request),execute)),
    remoteMethods:{
      /** @param {string} input @returns {Promise<string>} */
      derive:async input=>{
        // Async context must remain bound across an awaited operation.
        await Promise.resolve();
        const audience=context.getStore();
        if(typeof audience!=='string'||audience==='unverified')throw Error('Missing verified audience');
        privateExecutions++;
        return native(audience,input);
      }
    }
  });
  /** @type {http.Server[]} */
  const servers=[];
  try{
    const trusted=await listen(handler);
    servers.push(trusted.server);
    const url=trusted.url+'/obfs/rpc';
    const sourceDenied=await fetch(trusted.url+'/obfs/remote.mjs');
    assert.equal(sourceDenied.status,403);
    const sourceAllowed=await fetch(trusted.url+'/obfs/remote.mjs',{
      headers:{'x-session':sessionA}
    });
    assert.equal(sourceAllowed.status,200);
    const delivered=await sourceAllowed.text();
    assert.doesNotMatch(delivered,/bound-rpc-v1|createHmac|privateExecutions/u);

    const invalid=await invoke(url,challenge('invalid',0));
    assert.equal(invalid.status,403);
    assert.equal(privateExecutions,0);
    const rejectedAudienceArgument=await invoke(url,challenge('invalid',1),sessionA,
      [challenge('invalid',1),'account-B']);
    assert.equal(rejectedAudienceArgument.status,403);
    assert.equal(privateExecutions,0);

    const attacker=await listen(attackerRelay(url,sessionA));
    servers.push(attacker.server);
    const relayUrl=attacker.url+'/rpc';

    let ownAccountRelayMatches=0;
    let targetAccountValidMatches=0;
    let mistakenCrossAccountMatches=0;
    const heldout=Array.from({length:32},(_,i)=>challenge('heldout',i));
    for(const input of heldout){
      const forged=await invoke(relayUrl,input);
      const directB=await invoke(url,input,sessionB);
      assert.equal(forged.status,200);
      assert.equal(directB.status,200);
      assert.equal(forged.value,native('account-A',input));
      assert.equal(directB.value,native('account-B',input));
      ownAccountRelayMatches++;
      targetAccountValidMatches++;
      if(forged.value===directB.value)mistakenCrossAccountMatches++;
    }
    assert.equal(ownAccountRelayMatches,32);
    assert.equal(targetAccountValidMatches,32);
    assert.equal(mistakenCrossAccountMatches,0);

    // Concurrent principals must retain their own verified async context,
    // even when execution interleaves through Promise continuations.
    const parallelInputs=Array.from({length:4},(_,i)=>challenge('parallel',i));
    const concurrent=await Promise.all(parallelInputs.flatMap(input=>[
      invoke(url,input,sessionA),invoke(url,input,sessionB)
    ]));
    for(let i=0;i<parallelInputs.length;i++){
      assert.equal(concurrent[2*i].status,200);
      assert.equal(concurrent[2*i].value,native('account-A',parallelInputs[i]));
      assert.equal(concurrent[2*i+1].status,200);
      assert.equal(concurrent[2*i+1].value,native('account-B',parallelInputs[i]));
    }

    const inputs=Array.from({length:12},(_,i)=>challenge('performance',i));
    const expected=inputs.map(input=>native('account-A',input));
    /** @type {number[]} */
    const localTimes=[],directTimes=[],relayTimes=[];
    for(let i=0;i<3;i++){
      assert.equal((await invoke(url,inputs[i],sessionA)).value,expected[i]);
      assert.equal((await invoke(relayUrl,inputs[i])).value,expected[i]);
    }
    for(let round=0;round<9;round++){
      const orders=[['local','direct','relay'],['relay','local','direct'],
        ['direct','relay','local']];
      for(const approach of orders[round%orders.length]){
        const start=performance.now();
        /** @type {string[]} */
        const results=[];
        for(const input of inputs){
          if(approach==='local')results.push(native('account-A',input));
          else{
            const reply=await invoke(approach==='direct'?url:relayUrl,input,
              approach==='direct'?sessionA:undefined);
            assert.equal(reply.status,200);
            results.push(/** @type {string} */(reply.value));
          }
        }
        assert.deepEqual(results,expected);
        const elapsed=performance.now()-start;
        if(approach==='local')localTimes.push(elapsed);
        else if(approach==='direct')directTimes.push(elapsed);
        else relayTimes.push(elapsed);
      }
    }
    const localMedian=median(localTimes);
    const directMedian=median(directTimes);
    const relayMedian=median(relayTimes);
    return {
      node:process.version,platform:process.platform,
      protectedKeyBits:256,challengeBits:128,workBytes:work.length,
      protectedSourceOnClient:false,unverifiedStatus:invalid.status,
      clientSuppliedAudienceOverrideStatus:rejectedAudienceArgument.status,
      heldoutChallenges:heldout.length,
      attackerOwnAccountOnlineRelayMatches:ownAccountRelayMatches,
      honestTargetAccountMatches:targetAccountValidMatches,
      attackerCrossAccountMatches:mistakenCrossAccountMatches,
      concurrentCrossAccountChecks:concurrent.length,
      localMedianMs:localMedian,directMedianMs:directMedian,relayMedianMs:relayMedian,
      directRuntimeRatio:directMedian/localMedian,relayRuntimeRatio:relayMedian/localMedian,
      fullControlCaveat:'Distinct verified audiences prevent account-A-only token from producing account-B digest; A still has a perfect online relay for A. This experiment does not model stolen B credentials, compromised server, real WAN RTT or arbitrary JavaScript programs.'
    };
  }finally{
    for(const server of servers.reverse()){
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
  }
}

if(require.main===module){
  experiment().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment};
