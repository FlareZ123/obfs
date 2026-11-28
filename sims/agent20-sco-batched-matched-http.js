'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {createScoHandler,partitionScoSelectedAsyncExports,bindScoModuleExports}=require('../src');
const {privateSource}=require('./sco-rankfour-cubic-matched-private-api');
const {prepareLowRankBatchInverter}=require('./agent20-lowrank-batch-index');

const TOKEN='authorized-sco-batched-lowrank-test';
const METHOD='protectedCubic';

/** @typedef {{origin:string,method:string}} Access */
/** @typedef {{arm:'sco'|'minified-private-api',queries:number,privateCalls:number,deniedStatus:number,transcriptSha256:string,preimageSha256:string,publicFacadeBytes:number,privateBytes:number,sourceLeaks:boolean,setupCalls:number,samplingCalls:number,interpolantNullity:number,scannedCycles:number,cacheHits:number,offlineAfterClose:boolean}} ArmReceipt */

class NeedQuery extends Error {
  /** @param {number} input */
  constructor(input){super('Synchronous inverter requested missing authenticated oracle input');this.input=input>>>0;}
}
/** @param {number} seed @returns {()=>number} */
function drawWords(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/**
 * Replay only the setup phase whenever the synchronous inverter needs a new
 * real HTTP answer. Once constructed, retain one inverter and its entire
 * cross-target output-to-preimage cache, retrying an incomplete target after
 * only the single missing authorized request.
 *
 * @param {Access} access
 * @param {number[]} targets
 * @returns {Promise<{preimages:number[],queries:number,transcriptSha256:string,
 *   stats:{setupCalls:number,samplingCalls:number,interpolantNullity:number,
 *   scannedCycles:number,cacheHits:number,totalCalls:number}}>}
 */
async function invertOverHttp(access,targets){
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  /** @param {number} input @returns {number} */
  function observed(input){
    const key=input>>>0;
    if(!seen.has(key))throw new NeedQuery(key);
    return /** @type {number} */ (seen.get(key));
  }
  /** @param {number} input @returns {Promise<void>} */
  async function request(input){
    assert.equal(seen.has(input),false,'Should not issue duplicate authenticated queries');
    const reply=await fetch(access.origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json','x-demo-session':TOKEN},
      body:JSON.stringify({method:access.method,args:[input]})
    });
    assert.equal(reply.status,200,'Authorized private API rejected a valid chosen query');
    /** @type {{ok?:unknown,value?:unknown}} */
    const result=await reply.json();
    assert.equal(result.ok,true);
    assert.ok(typeof result.value==='number'&&Number.isInteger(result.value)&&
      result.value>=0&&result.value<2**32,'Expected a uint32 private answer');
    const value=/** @type {number} */ (result.value)>>>0;
    seen.set(input,value);
    transcript.update(JSON.stringify([input,value])+'\n');
  }
  /** @type {ReturnType<typeof prepareLowRankBatchInverter>|undefined} */
  let inverter;
  while(!inverter){
    // The seeded sample tape must start at the same place on every replay;
    // this is a reproducible test tape, not an empirical random model.
    const draw=drawWords(0x13572469);
    try{
      inverter=prepareLowRankBatchInverter(observed,{
        bits:32,rankBound:4,completion:'sampled-residual',
        sample:()=>draw(),maxSamples:128
      });
    }catch(error){
      if(!(error instanceof NeedQuery))throw error;
      await request(error.input);
    }
  }
  /** @type {number[]} */
  const preimages=[];
  for(const target of targets){
    for(;;){
      try{
        preimages.push(inverter.invert(target).preimage);
        break;
      }catch(error){
        if(!(error instanceof NeedQuery))throw error;
        await request(error.input);
      }
    }
  }
  const stats=inverter.stats();
  assert.equal(seen.size,stats.totalCalls);
  for(const target of targets){
    assert.equal(inverter.invert(target).newOracleCalls,0);
  }
  assert.equal(seen.size,inverter.stats().totalCalls);
  return {preimages,queries:seen.size,
    transcriptSha256:transcript.digest('hex'),stats};
}

/**
 * Serve the same private source on either SCO or equal-trust minified private
 * API. Only SCO publishes a client facade. Both refuse unauthenticated calls.
 * @param {'sco'|'minified-private-api'} arm
 * @param {string} source
 * @param {ReturnType<typeof partitionScoSelectedAsyncExports>} selected
 * @param {number[]} targets
 * @param {number[]} secrets
 * @returns {Promise<ArmReceipt>}
 */
async function executeArm(arm,source,selected,targets,secrets){
  const servedPrivate=arm==='sco'?source:transformSync(source,{
    loader:'js',format:'esm',target:'es2022',minify:true
  }).code;
  const privateModule=await import('data:text/javascript,'+encodeURIComponent(servedPrivate));
  assert.equal(typeof privateModule.protectedCubic,'function');
  let privateCalls=0;
  const method=selected.methodNames.protectedCubic;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    if(arm==='sco'){
      const bound=bindScoModuleExports(selected,privateModule);
      /** @type {Record<string,(...args:any[])=>Promise<unknown>>} */
      const wrapped=Object.create(null);
      for(const [name,fn] of Object.entries(bound)){
        wrapped[name]=async(...args)=>{privateCalls++;return await fn(...args);};
      }
      server=http.createServer(createScoHandler([selected.clientFile],{
        remoteMethods:wrapped,
        authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
        authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
        authorizeOperation:(req,name,args)=>
          req.headers['x-demo-session']===TOKEN&&
          name===method&&args.length===1&&
          Number.isSafeInteger(args[0])&&
          /** @type {number} */(args[0])>=0&&
          /** @type {number} */(args[0])<2**32
      }));
    }else{
      server=http.createServer(async(req,res)=>{
        if(req.headers['x-demo-session']!==TOKEN){
          res.statusCode=403;res.end(JSON.stringify({ok:false}));return;
        }
        if(req.url!=='/obfs/rpc'||req.method!=='POST'){
          res.statusCode=404;res.end(JSON.stringify({ok:false}));return;
        }
        /** @type {Buffer[]} */
        const chunks=[];
        for await(const chunk of req)chunks.push(Buffer.from(chunk));
        /** @type {{method?:unknown,args?:unknown}} */
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const args=body.args;
        if(body.method!==method||!Array.isArray(args)||args.length!==1||
          !Number.isSafeInteger(args[0])||args[0]<0||args[0]>=2**32){
          res.statusCode=400;res.end(JSON.stringify({ok:false}));return;
        }
        privateCalls++;
        const value=await privateModule.protectedCubic(args[0]);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ok:true,value}));
      });
    }
    const active=server;
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',resolve);
    });
    await listening;
    const address=active.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[7]})
    });
    assert.equal(denied.status,403);
    let publicFacadeBytes=0;
    let sourceLeaks=false;
    if(arm==='sco'){
      const published=await fetch(origin+'/obfs/mixed.mjs',{
        headers:{'x-demo-session':TOKEN}
      });
      assert.equal(published.status,200);
      const publicCode=await published.text();
      assert.equal(publicCode,selected.clientFile.code);
      publicFacadeBytes=Buffer.byteLength(publicCode);
      sourceLeaks=/OBFS_PRIVATE_|obfsPrivateParity|obfsPrivateMix/u.test(publicCode);
      assert.equal(sourceLeaks,false);
      assert.ok(publicCode.includes(method),'No callable RPC method in served client');
    }
    const inverted=await invertOverHttp({origin,method},targets);
    assert.deepEqual(inverted.preimages,secrets,
      'The private map is bijective; each targeted output has a unique preimage');
    assert.equal(privateCalls,inverted.queries);
    const stopped=active;
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      stopped.close(error=>error?reject(error):resolve()));
    await closed;
    server=undefined;
    // Source-private verification occurs *after* the server closes. The
    // attacker retains preimages/targets, not the private implementation.
    for(let i=0;i<secrets.length;i++)
      assert.equal(await privateModule.protectedCubic(inverted.preimages[i]),targets[i]);
    assert.equal(privateCalls,inverted.queries);
    return {arm,queries:inverted.queries,privateCalls,
      deniedStatus:denied.status,transcriptSha256:inverted.transcriptSha256,
      preimageSha256:createHash('sha256').update(JSON.stringify(inverted.preimages)).digest('hex'),
      publicFacadeBytes,privateBytes:Buffer.byteLength(servedPrivate),sourceLeaks,
      setupCalls:inverted.stats.setupCalls,
      samplingCalls:inverted.stats.samplingCalls,
      interpolantNullity:inverted.stats.interpolantNullity,
      scannedCycles:inverted.stats.scannedCycles,
      cacheHits:inverted.stats.cacheHits,
      offlineAfterClose:true};
  }finally{
    if(server){
      const pending=server;
      /** @type {Promise<void>} */
      const cleaned=new Promise((resolve,reject)=>
        pending.close(error=>error?reject(error):resolve()));
      await cleaned;
    }
  }
}

/**
 * Equal-source, equal-authority SCO vs minified server comparison. The
 * challenge source and preimages are harness-private. The attacker sees only
 * 32 fixed output targets, a legitimate HTTP method and its auth credential.
 * @returns {Promise<{sco:ArmReceipt,minified:ArmReceipt,matchedTranscript:boolean,matchedPrivateExecutions:boolean,targets:number,cosets:number,sourceSha256:string}>}
 */
async function compare(){
  const source=privateSource();
  const selected=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'agent20-batched-sco-matched-20261128',privateNames:[METHOD]});
  const privateModule=await import('data:text/javascript,'+encodeURIComponent(source));
  const base=0x15f32a7c;
  /** @type {number[]} */
  const secrets=[];
  for(const offset of [0,1<<17])for(let high=0;high<16;high++){
    secrets.push((((base^offset)&0x0fffffff)|(high<<28))>>>0);
  }
  /** @type {number[]} */
  const targets=[];
  for(const secret of secrets)targets.push(await privateModule.protectedCubic(secret));
  assert.equal(new Set(targets).size,32);
  const sco=await executeArm('sco',source,selected,targets,secrets);
  const minified=await executeArm('minified-private-api',source,selected,targets,secrets);
  assert.equal(sco.queries,minified.queries);
  assert.equal(sco.transcriptSha256,minified.transcriptSha256);
  assert.equal(sco.preimageSha256,minified.preimageSha256);
  assert.equal(sco.privateCalls,sco.queries);
  assert.equal(minified.privateCalls,minified.queries);
  assert.ok(sco.queries<=32+1+128+32);
  return {sco,minified,matchedTranscript:true,matchedPrivateExecutions:true,
    targets:targets.length,cosets:2,
    sourceSha256:createHash('sha256').update(source).digest('hex')};
}
if(require.main===module){
  compare().then(result=>console.log('SCO_BATCHED_MATCHED_HTTP '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={invertOverHttp,executeArm,compare};
