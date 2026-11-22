'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash,randomBytes}=require('node:crypto');
const {
  createScoHandler,partitionScoSelectedAsyncExports,bindScoModuleExports
}=require('../src');
const {
  learnProjectedAffineOracle,evaluateProjectedAffineModel
}=require('./projected-affine-coset-profile-clone');

const TOKEN='authorized-arbitrary-table-study';

/** @typedef {{origin:string,method:string,credential:string}} Access */
/** @typedef {ReturnType<typeof learnProjectedAffineOracle>} Model */

/**
 * The hidden source has an arbitrary 32-word vector table behind five
 * independent parity projections. This is a genuine rank-five nonlinear
 * table, rather than the rank-six quadratic oracle previously tested over
 * authenticated SCO RPC.
 *
 * Only a trusted harness constructs and imports this private source. It is
 * never supplied to the learner or included in the public SCO facade.
 * @returns {string}
 */
function privateSource(){
  const table=Array.from({length:32},(_,i)=>
    createHash('sha256').update('private-table-rank5/'+i)
      .digest().readUInt32BE(0));
  table[31]=(table[31]^0x9765c3af)>>>0;
  return [
    'const OBFS_PRIVATE_MASK0=0xc7639c15;',
    'const OBFS_PRIVATE_MASK1=0x32e67ad1;',
    'const OBFS_PRIVATE_MASK2=0xe5ab17c2;',
    'const OBFS_PRIVATE_MASK3=0x4692ed7f;',
    'const OBFS_PRIVATE_MASK4=0x1fa37cc9;',
    'const OBFS_PRIVATE_VECTOR_TABLE='+JSON.stringify(table)+';',
    'const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;',
    'function obfsPrivateParity(x){',
    '  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;',
    '  return x&1;',
    '}',
    'export async function protectedGenericFive(input){',
    '  const x=input>>>0;',
    '  const z0=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);',
    '  const z1=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);',
    '  const z2=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);',
    '  const z3=obfsPrivateParity(x&OBFS_PRIVATE_MASK3);',
    '  const z4=obfsPrivateParity(x&OBFS_PRIVATE_MASK4);',
    '  const index=z0|(z1<<1)|(z2<<2)|(z3<<3)|(z4<<4);',
    '  const affine=((x<<5)|(x>>>27))^((x<<13)|(x>>>19));',
    '  return (affine^OBFS_PRIVATE_OFFSET^OBFS_PRIVATE_VECTOR_TABLE[index])>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
}

/** A synchronous learner requests one new asynchronous RPC value. */
class NeedQuery extends Error {
  /** @param {number} input */
  constructor(input){
    super('The source-independent learner requested one missing oracle value');
    this.input=input>>>0;
  }
}

/**
 * Drive the exact source-independent synchronous learner over real HTTP by
 * replaying previously queried responses and the same independent draws.
 * Any missing chosen input causes exactly one new authenticated RPC before
 * restarting the pure learner. This does not supply or inspect source code.
 *
 * @param {Access} access
 * @param {number[]} draws A shared random-word tape for matched controls
 * @returns {Promise<{model:Model,queries:number,transcriptSha256:string}>}
 */
async function cloneFromHttp(access,draws){
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  for(;;){
    let drawIndex=0;
    /** @returns {number} */
    function draw(){
      if(drawIndex===draws.length)draws.push(randomBytes(4).readUInt32BE(0));
      return draws[drawIndex++];
    }
    try{
      const model=learnProjectedAffineOracle(input=>{
        const key=input>>>0;
        if(!seen.has(key))throw new NeedQuery(key);
        return /** @type {number} */ (seen.get(key));
      },32,5,draw,1e-10);
      assert.equal(model.queries,seen.size);
      assert.ok(model.failureBound<1e-10);
      assert.ok(model.queries<=72688);
      return {model,queries:seen.size,
        transcriptSha256:transcript.digest('hex')};
    }catch(error){
      if(!(error instanceof NeedQuery))throw error;
      const input=error.input;
      const response=await fetch(access.origin+'/obfs/rpc',{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-demo-session':access.credential
        },
        body:JSON.stringify({method:access.method,args:[input]})
      });
      assert.equal(response.status,200,'Legitimate forward query rejected');
      /** @type {{ok?:boolean,value?:unknown}} */
      const data=await response.json();
      assert.equal(data.ok,true);
      const value=data.value;
      assert.ok(typeof value==='number'&&Number.isInteger(value)&&
        value>=0&&value<2**32,'Private RPC output is not a uint32');
      seen.set(input,value);
      transcript.update(JSON.stringify([input,value])+'\n');
    }
  }
}

/**
 * Start a real authenticated localhost SCO or native Node HTTP oracle,
 * with the same frozen hidden ESM implementation in both arms. The source
 * module is loaded by the trusted server only. The attacker receives only
 * an RPC method string and JSON responses.
 *
 * @param {'sco'|'native'} arm
 * @param {string} source
 * @param {number[]} draws Same random candidate input tape in both arms
 * @returns {Promise<{arm:'sco'|'native',sourceHash:string,queries:number,
 *   heldouts:number,privateExecutions:number,deniedStatus:number,
 *   publishedPrivateNames:boolean,transcriptSha256:string,
 *   offlineAfterServerClosed:boolean}>}
 */
async function executeArm(arm,source,draws){
  const privateModule=await import(
    'data:text/javascript,'+encodeURIComponent(source));
  /** @type {import('node:http').Server|undefined} */
  let server;
  let privateExecutions=0;
  let publishedPrivateNames=false;
  let method='protectedGenericFive';
  try{
    if(arm==='sco'){
      const selected=partitionScoSelectedAsyncExports({
        path:'mixed.mjs',sourceType:'module',code:source
      },{
        seed:'sco-arbitrary-table-rankfive-live',
        privateNames:['protectedGenericFive']
      });
      publishedPrivateNames=/OBFS_PRIVATE_MASK|OBFS_PRIVATE_VECTOR_TABLE|OBFS_PRIVATE_OFFSET/u
        .test(selected.clientFile.code);
      assert.equal(publishedPrivateNames,false,
        'A private implementation identifier was published');
      const routed=bindScoModuleExports(selected,privateModule);
      /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
      const methods=Object.create(null);
      for(const [name,fn] of Object.entries(routed)){
        methods[name]=(...args)=>{
          privateExecutions++;
          return fn(...args);
        };
      }
      server=http.createServer(createScoHandler([selected.clientFile],{
        remoteMethods:methods,
        authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
        authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
        authorizeOperation:(req,name,args)=>
          req.headers['x-demo-session']===TOKEN&&
          name===selected.methodNames.protectedGenericFive&&
          args.length===1&&Number.isInteger(args[0])&&
          /** @type {number} */ (args[0])>=0&&
          /** @type {number} */ (args[0])<2**32
      }));
    }else{
      server=http.createServer(async(req,res)=>{
        if(req.headers['x-demo-session']!==TOKEN){
          res.statusCode=403;
          res.end('Forbidden');
          return;
        }
        if(req.url!=='/obfs/rpc'||req.method!=='POST'){
          res.statusCode=404;
          res.end('Not found');
          return;
        }
        /** @type {Buffer[]} */
        const chunks=[];
        for await(const part of req)chunks.push(Buffer.from(part));
        /** @type {{method?:unknown,args?:unknown}} */
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const args=body.args;
        if(body.method!==method||!Array.isArray(args)||
           args.length!==1||typeof args[0]!=='number'||
           !Number.isInteger(args[0])||args[0]<0||args[0]>=2**32){
          res.statusCode=400;
          res.end('Bad request');
          return;
        }
        privateExecutions++;
        const value=await privateModule.protectedGenericFive(args[0]);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ok:true,value}));
      });
    }
    const running=server;
    await new Promise((resolve,reject)=>{
      running.once('error',reject);
      running.listen(0,'127.0.0.1',resolve);
    });
    const address=running.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[7]})
    });
    assert.equal(denied.status,403);
    if(arm==='sco'){
      const published=await fetch(origin+'/obfs/mixed.mjs',{
        headers:{'x-demo-session':TOKEN}
      });
      assert.equal(published.status,200);
      const sourceBytes=await published.text();
      assert.doesNotMatch(sourceBytes,
        /OBFS_PRIVATE_MASK|OBFS_PRIVATE_VECTOR_TABLE|OBFS_PRIVATE_OFFSET/u);
      const route=sourceBytes.match(
        /export async function protectedGenericFive\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
      );
      assert.ok(route?.[1],'The published facade did not expose its RPC route');
      method=route[1];
    }
    const clone=await cloneFromHttp({origin,method,credential:TOKEN},draws);
    assert.equal(privateExecutions,clone.queries);
    const model=/** @type {Model} */ (JSON.parse(JSON.stringify(clone.model)));
    const stopped=server;
    await new Promise((resolve,reject)=>
      stopped.close(error=>error?reject(error):resolve()));
    server=undefined;
    let heldouts=0;
    for(let i=0;i<1024;i++){
      const x=createHash('sha256').update('rankfive-live-heldout/'+i)
        .digest().readUInt32BE(0);
      const expected=await privateModule.protectedGenericFive(x);
      assert.equal(evaluateProjectedAffineModel(model,x),expected,
        'Offline reconstruction mismatch on an unqueried held-out input');
      heldouts++;
    }
    assert.equal(privateExecutions,clone.queries,
      'An offline evaluator unexpectedly queried the closed server');
    return {
      arm,sourceHash:createHash('sha256').update(source).digest('hex'),
      queries:clone.queries,heldouts,privateExecutions,
      deniedStatus:denied.status,publishedPrivateNames,
      transcriptSha256:clone.transcriptSha256,
      offlineAfterServerClosed:true
    };
  }finally{
    if(server){
      const remaining=server;
      await new Promise((resolve,reject)=>
        remaining.close(error=>error?reject(error):resolve()));
    }
  }
}

/**
 * An equal-source, equal-query-stream native-vs-SCO attack experiment.
 * No claimed runtime security gain: a legitimate user can clone this fixed
 * function in both variants through the same allowed input/output protocol.
 *
 * @returns {Promise<{sco:Awaited<ReturnType<typeof executeArm>>,
 *   native:Awaited<ReturnType<typeof executeArm>>,matchedTranscripts:boolean}>}
 */
async function compare(){
  const privateCode=privateSource();
  /** @type {number[]} */
  const draws=[];
  const sco=await executeArm('sco',privateCode,draws);
  const native=await executeArm('native',privateCode,draws);
  assert.equal(sco.sourceHash,native.sourceHash);
  assert.equal(sco.queries,native.queries);
  assert.equal(sco.transcriptSha256,native.transcriptSha256);
  assert.equal(sco.deniedStatus,403);
  assert.equal(native.deniedStatus,403);
  assert.equal(sco.heldouts,1024);
  assert.equal(native.heldouts,1024);
  return {sco,native,matchedTranscripts:true};
}

if(require.main===module){
  compare().then(result=>
    process.stdout.write('SCO_NATIVE_ARBITRARY_TABLE_RANK5 '+JSON.stringify(result)+'\n')
  ).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={privateSource,cloneFromHttp,executeArm,compare};
