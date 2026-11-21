'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {clone:cloneProjected,evaluate:evaluateProjected}=
  require('./rankthree-polarization-oracle-clone');

const TOKEN='authorized-rankthree-oracle-study';
const TRIPLE_SEED=0x6174b20d;

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  };
}

/**
 * Attacker observes only legitimate RPC replies and a published method
 * identifier. All adaptive polar requests run over actual authenticated
 * HTTP; the source and server-private function are never given to it.
 *
 * @param {{origin:string,method:string,credential:string}} access
 * @returns {Promise<{
 *   model:ReturnType<typeof cloneProjected>,queries:number,
 *   transcriptSha256:string,cubicWitness:boolean,quadraticWitness:boolean,
 *   thirdDerivativeTrials:number
 * }>}
 */
async function cloneAuthenticatedRankThree(access){
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  /** @param {number} input @returns {Promise<number>} */
  async function ask(input){
    const key=input>>>0;
    if(seen.has(key))
      return /** @type {number} */ (seen.get(key));
    const response=await fetch(access.origin+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json','x-demo-session':access.credential},
      body:JSON.stringify({method:access.method,args:[key]})
    });
    assert.equal(response.status,200,'Authorized private RPC rejected');
    /** @type {{ok?:boolean,value?:unknown}} */
    const data=await response.json();
    assert.equal(data.ok,true);
    const value=data.value;
    assert.ok(typeof value==='number'&&Number.isInteger(value)&&
      value>=0&&value<2**32,'Private endpoint returned non-uint32');
    seen.set(key,value);
    transcript.update(JSON.stringify([key,value])+'\n');
    return value;
  }
  /** @param {number} input @returns {number} */
  function cached(input){
    const value=seen.get(input>>>0);
    assert.notEqual(value,undefined,'Transcript lacks required chosen query');
    return /** @type {number} */ (value);
  }
  /** @param {number} a @param {number} b @returns {number} */
  function B(a,b){
    return (cached(0)^cached(a)^cached(b)^cached((a^b)>>>0))>>>0;
  }
  /** @param {number} a @param {number} b @param {number} c @returns {number} */
  function T(a,b,c){
    return (cached(0)^cached(a)^cached(b)^cached(c)^
      cached((a^b)>>>0)^cached((a^c)>>>0)^
      cached((b^c)>>>0)^cached((a^b^c)>>>0))>>>0;
  }

  await ask(0);
  for(let i=0;i<32;i++)await ask((1<<i)>>>0);
  const draw=seeded(TRIPLE_SEED);
  const tripleLimit=Math.ceil(Math.log(1e-10)/Math.log(43/64));
  let cubicWitness=false,quadraticWitness=false;
  let cubicA=0,cubicB=0,cubicC=0,quadraticA=0,quadraticB=0;
  let thirdDerivativeTrials=0;
  for(let i=0;i<tripleLimit;i++){
    const a=draw(),b=draw(),c=draw();
    for(const input of [a,b,c,(a^b)>>>0,(a^c)>>>0,(b^c)>>>0,
      (a^b^c)>>>0])await ask(input);
    if(!quadraticWitness){
      for(const [x,y] of [[a,b],[a,c],[b,c]]){
        if(B(x,y)!==0){
          quadraticA=x;quadraticB=y;quadraticWitness=true;
          break;
        }
      }
    }
    thirdDerivativeTrials++;
    if(T(a,b,c)!==0){
      cubicWitness=true;cubicA=a;cubicB=b;cubicC=c;
      break;
    }
  }
  if(cubicWitness){
    for(let i=0;i<32;i++){
      const e=(1<<i)>>>0;
      for(const input of [
        (e^cubicB)>>>0,(e^cubicC)>>>0,
        (e^cubicB^cubicC)>>>0,(e^cubicA)>>>0,
        (e^cubicA^cubicC)>>>0,(e^cubicA^cubicB)>>>0
      ])await ask(input);
    }
  }else if(quadraticWitness){
    for(let i=0;i<32;i++){
      const e=(1<<i)>>>0;
      await ask((e^quadraticA)>>>0);
      await ask((e^quadraticB)>>>0);
    }
  }
  // Replay the identical chosen-input transcript against a synchronous
  // in-memory read-only callback. No further server requests are permitted.
  const model=cloneProjected(cached,32,seeded(TRIPLE_SEED));
  assert.equal(model.queries,seen.size,'Offline learner used a different query set');
  assert.equal(model.trials,thirdDerivativeTrials);
  assert.equal(model.degree===3,cubicWitness);
  assert.ok(seen.size<=631,'The derived 631-query bound was exceeded');
  return {model,queries:seen.size,transcriptSha256:transcript.digest('hex'),
    cubicWitness,quadraticWitness,thirdDerivativeTrials};
}

/**
 * Construct a private 32-bit degree-two or degree-three rank-three input
 * projection function. No member of this hidden source is passed into the
 * attacking code above.
 * @param {'quadratic'|'cubic'} degree
 * @returns {string}
 */
function privateSource(degree){
  const h123=degree==='cubic'?0x93f2471b:0;
  return [
    'const OBFS_PRIVATE_MASK0=0xf5a13b57;',
    'const OBFS_PRIVATE_MASK1=0x83cc6e2d;',
    'const OBFS_PRIVATE_MASK2=0x6d5f92b3;',
    'const OBFS_PRIVATE_H12=0xa573bd2c;',
    'const OBFS_PRIVATE_H13=0xc3e71649;',
    'const OBFS_PRIVATE_H23=0x4b2d8fa1;',
    'const OBFS_PRIVATE_H123='+h123+';',
    'const OBFS_PRIVATE_OFFSET=0x7283b4a5;',
    'function obfsPrivateParity(word){',
    '  word^=word>>>16;word^=word>>>8;word^=word>>>4;',
    '  word^=word>>>2;word^=word>>>1;return word&1;',
    '}',
    'export async function protectedRankThree(value){',
    '  const x=value>>>0;',
    '  const p=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);',
    '  const q=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);',
    '  const r=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);',
    '  let out=(x^((x<<5)|(x>>>27))^((x<<13)|(x>>>19))^OBFS_PRIVATE_OFFSET)>>>0;',
    '  if(p&q)out=(out^OBFS_PRIVATE_H12)>>>0;',
    '  if(p&r)out=(out^OBFS_PRIVATE_H13)>>>0;',
    '  if(q&r)out=(out^OBFS_PRIVATE_H23)>>>0;',
    '  if(p&q&r)out=(out^OBFS_PRIVATE_H123)>>>0;',
    '  return out>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
}

/**
 * End-to-end source-separated SCO adversary: publish only the RPC facade,
 * authenticate 631-or-fewer live chosen queries, close the server, then
 * compare a transported offline clone against held-out true private values.
 * @param {'quadratic'|'cubic'} degree
 * @returns {Promise<{
 *   degree:'quadratic'|'cubic',queries:number,heldout:number,matched:number,
 *   cubicWitness:boolean,quadraticWitness:boolean,thirdDerivativeTrials:number,
 *   privateExecutions:number,deniedStatus:number,publishedPrivateNames:boolean,
 *   serverClosedBeforeHeldouts:boolean,sourceSha256:string,transcriptSha256:string
 * }>}
 */
async function runChallenge(degree){
  const source=privateSource(degree);
  const selected=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'sco-rankthree-real-http-'+degree,
    privateNames:['protectedRankThree']});
  const leaked=/OBFS_PRIVATE_MASK|OBFS_PRIVATE_H1|OBFS_PRIVATE_H2|OBFS_PRIVATE_OFFSET/u
    .test(selected.clientFile.code);
  assert.equal(leaked,false,'A private parameter leaked into the client facade');
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(selected,original);
  let privateExecutions=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const instrumented=Object.create(null);
  for(const [name,fn] of Object.entries(methods)){
    instrumented[name]=(...args)=>{
      privateExecutions++;
      return fn(...args);
    };
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
        method===selected.methodNames.protectedRankThree&&
        args.length===1&&Number.isInteger(args[0])&&
        /** @type {number} */ (args[0])>=0&&
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
      body:JSON.stringify({method:selected.methodNames.protectedRankThree,args:[7]})
    });
    assert.equal(denied.status,403);
    const published=await fetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(published.status,200);
    const deliveredSource=await published.text();
    assert.equal(deliveredSource,selected.clientFile.code);
    const match=deliveredSource.match(
      /export async function protectedRankThree\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
    assert.ok(match?.[1],'Attacker could not recover public method route');
    const access={origin,method:match[1],credential:TOKEN};
    const attacker=await cloneAuthenticatedRankThree(access);
    assert.equal(privateExecutions,attacker.queries);
    const serialized=JSON.stringify(attacker.model);
    const model=/** @type {ReturnType<typeof cloneProjected>} */ (JSON.parse(serialized));
    const closed=server;
    /** @type {Promise<void>} */
    const done=new Promise((resolve,reject)=>
      closed.close(error=>error?reject(error):resolve()));
    await done;
    server=undefined;
    const serverClosedBeforeHeldouts=true;
    const heldoutInputs=[0xffffffff,0xaaaaaaaa,0x55555555,0x12345678,
      0x00000007,0x80000000];
    for(let i=0;i<1024;i++){
      const digest=createHash('sha256').update('rankthree-heldout-'+i).digest();
      heldoutInputs.push(digest.readUInt32BE(0));
    }
    let matched=0;
    for(const input of heldoutInputs)
      if(evaluateProjected(model,input)===
        await original.protectedRankThree(input))matched++;
    assert.equal(matched,heldoutInputs.length);
    assert.equal(privateExecutions,attacker.queries,
      'Server-private method ran during offline-only evaluation');
    assert.equal(attacker.cubicWitness,degree==='cubic');
    return {degree,queries:attacker.queries,heldout:heldoutInputs.length,
      matched,cubicWitness:attacker.cubicWitness,
      quadraticWitness:attacker.quadraticWitness,
      thirdDerivativeTrials:attacker.thirdDerivativeTrials,
      privateExecutions,deniedStatus:denied.status,
      publishedPrivateNames:leaked,serverClosedBeforeHeldouts,
      sourceSha256:createHash('sha256').update(source).digest('hex'),
      transcriptSha256:attacker.transcriptSha256};
  }finally{
    if(server){
      const remaining=server;
      /** @type {Promise<void>} */
      const done=new Promise((resolve,reject)=>
        remaining.close(error=>error?reject(error):resolve()));
      await done;
    }
  }
}

/** @returns {Promise<void>} */
async function main(){
  const quadratic=await runChallenge('quadratic');
  const cubic=await runChallenge('cubic');
  console.log('SCO_RANKTHREE_631_LIVE_CLONE '+
    JSON.stringify({quadratic,cubic}));
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runChallenge,cloneAuthenticatedRankThree};
