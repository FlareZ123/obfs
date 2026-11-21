'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {privateSource,learnViaHttp,runChallenge}=
  require('./sco-rank6-adaptive-real-http-clone');
const {evaluate}=require('./rank4-6-quadratic-adaptive-polar-clone');

const CREDENTIAL='authorized-rank-six-study';
const METHOD='protectedRankSix';

/**
 * Authenticated plain native Node.js HTTP service with the exact same private
 * polynomial and JSON reply contract as the generated SCO RPC test. This
 * supplies a direct equal-trust baseline for the algebraic oracle clone.
 *
 * @returns {Promise<{
 *   nativeQueries:number,heldouts:number,matched:number,
 *   nativeUntrustedStatus:number,privateExecutions:number,
 *   privateAfterShutdown:number,nativeSourceSha256:string,
 *   transcriptSha256:string,sourcePublished:boolean
 * }>}
 */
async function runNativeControl(){
  const originalSource=privateSource();
  const privateModule=await import(
    'data:text/javascript,'+encodeURIComponent(originalSource));
  const sourceHash=createHash('sha256').update(originalSource).digest('hex');
  let privateCalls=0;
  let sourcePublished=false;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    server=http.createServer(async (req,res)=>{
      if(req.headers['x-demo-session']!==CREDENTIAL){
        res.statusCode=403;res.end('Forbidden');return;
      }
      if(req.url!=='/obfs/rpc'||req.method!=='POST'){
        res.statusCode=404;res.end('Not Found');return;
      }
      const chunks=[];
      for await(const chunk of req)chunks.push(Buffer.from(chunk));
      /** @type {{method?:unknown,args?:unknown}} */
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const args=payload.args;
      if(payload.method!==METHOD||!Array.isArray(args)||
        args.length!==1||!Number.isInteger(args[0])||
        args[0]<0||args[0]>=2**32){
        res.statusCode=400;res.end('Bad Request');return;
      }
      privateCalls++;
      const value=await privateModule.protectedRankSix(args[0]);
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ok:true,value}));
    });
    const active=server;
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',resolve);
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:METHOD,args:[7]})
    });
    assert.equal(denied.status,403);
    const access={origin,method:METHOD,credential:CREDENTIAL};
    const learned=await learnViaHttp(access);
    assert.equal(privateCalls,learned.calls);
    assert.ok(learned.calls<=516);
    const snapshot=/** @type {ReturnType<typeof import('./rank4-6-quadratic-adaptive-polar-clone').clone>} */
      (JSON.parse(JSON.stringify(learned.model)));
    const stopped=server;
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      stopped.close(err=>err?reject(err):resolve()));
    await closed;
    server=undefined;
    const callsAtShutdown=privateCalls;
    const values=[0,1,0xffffffff,0xaaaaaaaa,0x55555555,0x12345678,
      0x80000000,0xff];
    for(let i=0;i<1024;i++)
      values.push(createHash('sha256').update('rank6-heldout-'+i)
        .digest().readUInt32BE(0));
    let matched=0;
    for(const x of values){
      if(evaluate(snapshot,x)===
        await privateModule.protectedRankSix(x))matched++;
    }
    assert.equal(matched,values.length);
    assert.equal(privateCalls,callsAtShutdown);
    assert.equal(sourcePublished,false);
    return {nativeQueries:learned.calls,heldouts:values.length,
      matched,nativeUntrustedStatus:denied.status,
      privateExecutions:privateCalls,
      privateAfterShutdown:privateCalls-callsAtShutdown,
      nativeSourceSha256:sourceHash,
      transcriptSha256:learned.transcriptSha256,sourcePublished};
  }finally{
    if(server){
      const remaining=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        remaining.close(err=>err?reject(err):resolve()));
      await closed;
    }
  }
}
/** @returns {Promise<object>} */
async function main(){
  const [sco,native]=await Promise.all([runChallenge(),runNativeControl()]);
  assert.equal(sco.sourceSha256,native.nativeSourceSha256,
    'Matched controls did not run precisely the same private function source');
  assert.equal(sco.deniedStatus,native.nativeUntrustedStatus);
  assert.equal(sco.heldout,native.heldouts);
  assert.equal(sco.matched,native.matched);
  assert.equal(sco.offlineAfterServerClose,true);
  assert.equal(native.privateAfterShutdown,0);
  const output={samePrivateSource:true,sourceSha256:sco.sourceSha256,
    scoQueries:sco.queries,nativeQueries:native.nativeQueries,
    bothRejectedUnauthorized:true,offlineHeldoutsEach:native.heldouts,
    bothClonedAllHeldouts:true,scoTranscriptSha256:sco.transcriptSha256,
    nativeTranscriptSha256:native.transcriptSha256};
  console.log('MATCHED_SCO_NATIVE_RANK6_ORACLE '+JSON.stringify(output));
  return output;
}
if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,runNativeControl};
