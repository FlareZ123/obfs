'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');
const {clone,evaluate}=require('./rank4-6-quadratic-adaptive-polar-clone');
const TOKEN='authorized-rank-six-study';

/**
 * Private function has six independent input projection masks and three
 * nonzero disjoint quadratic pairs. Its exact polar radical codimension is 6.
 * The private source is retained only by the trusted test server.
 * @returns {string}
 */
function privateSource(){
  return [
    'const OBFS_PRIVATE_MASKS=[0xc7639c15,0x32e67ad1,0xe5ab17c2,0x4692ed7f,0x1fa37cc9,0x8bc9a203];',
    'const OBFS_PRIVATE_PAIRS=[0x21a5e4f3,0x56cd81ab,0xc57e1439];',
    'const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;',
    'function obfsPrivateParity(x){x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;return x&1;}',
    'export async function protectedRankSix(value){',
    '  const x=value>>>0;',
    '  const z=OBFS_PRIVATE_MASKS.map(mask=>obfsPrivateParity(mask&x));',
    '  let y=(x^((x<<7)|(x>>>25))^OBFS_PRIVATE_OFFSET)>>>0;',
    '  if(z[0]&z[1])y^=OBFS_PRIVATE_PAIRS[0];',
    '  if(z[2]&z[3])y^=OBFS_PRIVATE_PAIRS[1];',
    '  if(z[4]&z[5])y^=OBFS_PRIVATE_PAIRS[2];',
    '  return y>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
}
class NeedQuery extends Error{
  /** @param {number} value */
  constructor(value){super('Need authenticated oracle input');this.value=value>>>0;}
}
/**
 * Run a synchronous public-model learner against a real asynchronous SCO RPC.
 * Every replay uses exactly the same previous *securely random* draws, so a
 * missing query can be fetched without changing adaptive future decisions.
 * New random words come independently from crypto.randomBytes.
 *
 * @param {{origin:string,method:string,credential:string}} access
 * @returns {Promise<{model:ReturnType<typeof clone>,calls:number,
 *   words:number,transcriptSha256:string}>}
 */
async function learnViaHttp(access){
  /** @type {Map<number,number>} */
  const observations=new Map();
  /** @type {number[]} */
  const words=[];
  const transcript=createHash('sha256');
  for(;;){
    let index=0;
    /** @returns {number} */
    function draw(){
      if(index===words.length)words.push(randomBytes(4).readUInt32BE(0));
      return words[index++];
    }
    try{
      const model=clone(input=>{
        const key=input>>>0;
        if(!observations.has(key))throw new NeedQuery(key);
        return /** @type {number} */ (observations.get(key));
      },32,6,draw,1e-10);
      assert.equal(model.queries,observations.size);
      assert.equal(words.length,model.trials*2);
      assert.ok(model.queries<=516);
      return {model,calls:observations.size,words:words.length,
        transcriptSha256:transcript.digest('hex')};
    }catch(error){
      if(!(error instanceof NeedQuery))throw error;
      const input=error.value;
      const response=await fetch(access.origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':access.credential},
        body:JSON.stringify({method:access.method,args:[input]})
      });
      assert.equal(response.status,200);
      /** @type {{ok?:boolean,value?:unknown}} */
      const message=await response.json();
      assert.equal(message.ok,true);
      assert.ok(typeof message.value==='number'&&
        Number.isInteger(message.value)&&message.value>=0&&message.value<2**32);
      const value=/** @type {number} */ (message.value);
      observations.set(input,value);
      transcript.update(JSON.stringify([input,value])+'\n');
    }
  }
}
/**
 * @returns {Promise<{queries:number,draws:number,trialCount:number,
 *  anchors:number,heldout:number,matched:number,privateExecutions:number,
 *  deniedStatus:number,privateNamesPublished:boolean,
 *  offlineAfterServerClose:boolean,sourceSha256:string,transcriptSha256:string}>}
 */
async function runChallenge(){
  const privateCode=privateSource();
  const selected=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:privateCode
  },{seed:'sco-rank-six-adaptive-real-http',privateNames:['protectedRankSix']});
  const leaked=/OBFS_PRIVATE_MASKS|OBFS_PRIVATE_PAIRS|OBFS_PRIVATE_OFFSET/u
    .test(selected.clientFile.code);
  assert.equal(leaked,false);
  const original=await import('data:text/javascript,'+encodeURIComponent(privateCode));
  const methods=bindScoModuleExports(selected,original);
  let privateExecutions=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const instrumented=Object.create(null);
  for(const [name,fn] of Object.entries(methods)){
    instrumented[name]=(...args)=>{privateExecutions++;return fn(...args);};
  }
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    server=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:instrumented,
      authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
      authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
      authorizeOperation:(req,method,args)=>
        req.headers['x-demo-session']===TOKEN&&
        method===selected.methodNames.protectedRankSix&&args.length===1&&
        Number.isInteger(args[0])&&/** @type {number} */ (args[0])>=0&&
        /** @type {number} */ (args[0])<2**32
    }));
    const active=server;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:selected.methodNames.protectedRankSix,args:[7]})
    });
    assert.equal(denied.status,403);
    const response=await fetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(response.status,200);
    const delivered=await response.text();
    assert.equal(delivered,selected.clientFile.code);
    const route=delivered.match(
      /export async function protectedRankSix\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
    assert.ok(route?.[1]);
    const attacker=await learnViaHttp({
      origin,method:route[1],credential:TOKEN
    });
    assert.equal(privateExecutions,attacker.calls);
    const snapshot=/** @type {ReturnType<typeof clone>} */
      (JSON.parse(JSON.stringify(attacker.model)));
    const closed=server;
    /** @type {Promise<void>} */
    const done=new Promise((resolve,reject)=>
      closed.close(err=>err?reject(err):resolve()));
    await done;
    server=undefined;
    const inputs=[0xffffffff,0xaaaaaaaa,0x55555555,0x12345678,
      0,1,0x80000000,0xff];
    for(let i=0;i<1024;i++)
      inputs.push(createHash('sha256').update('rank6-heldout-'+i)
        .digest().readUInt32BE(0));
    let matched=0;
    for(const x of inputs)
      if(evaluate(snapshot,x)===await original.protectedRankSix(x))matched++;
    assert.equal(matched,inputs.length);
    assert.equal(privateExecutions,attacker.calls);
    assert.equal(snapshot.rank,6);
    return {queries:attacker.calls,draws:attacker.words,
      trialCount:snapshot.trials,anchors:snapshot.anchors,
      heldout:inputs.length,matched,privateExecutions,
      deniedStatus:denied.status,privateNamesPublished:leaked,
      offlineAfterServerClose:true,
      sourceSha256:createHash('sha256').update(privateCode).digest('hex'),
      transcriptSha256:attacker.transcriptSha256};
  }finally{
    if(server){
      const remaining=server;
      /** @type {Promise<void>} */
      const done=new Promise((resolve,reject)=>
        remaining.close(err=>err?reject(err):resolve()));
      await done;
    }
  }
}
if(require.main===module)
  runChallenge().then(out=>
    console.log('SCO_RANK_SIX_516_LIVE_ORACLE '+JSON.stringify(out)))
    .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={runChallenge,learnViaHttp};
