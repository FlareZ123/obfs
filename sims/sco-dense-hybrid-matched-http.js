'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {Worker}=require('node:worker_threads');
const esbuild=require('esbuild');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {makeRng,makeRivestPermutation,makeLinearTransform,applyLinear,u32}=
  require('./compatible-permutation-linear-sandwich-blackbox');

const TOKEN='authorized-dense-hybrid-matched-source';

/**
 * Recreate the exact source-private coefficients of the seeded Rivest
 * degree-three permutation, using primitive literal declarations so the
 * conservative SCO selected-export analyzer can admit it.
 *
 * @param {number} seed
 * @returns {number[]}
 */
function rivestCoefficients(seed) {
  const next=makeRng(seed);
  const coefficients=Array.from({length:4},()=>next());
  coefficients[1]=u32(coefficients[1]|1);
  if((coefficients[2]&1)!==0)coefficients[2]=u32(coefficients[2]^1);
  if((coefficients[3]&1)!==0)coefficients[3]=u32(coefficients[3]^1);
  return coefficients;
}

/**
 * Source-private fixture has exact seed parity with the 32-case Rivest-3
 * family in both the dense reanchoring and hybrid portfolio screens.
 *
 * @returns {{seed:number,secret:number,target:number,
 *   oracle:(x:number)=>number,source:string}}
 */
function fixture() {
  const seed=u32(0x7b4fa128^Math.imul(1,0x9e3779b9));
  const inner=makeLinearTransform(seed^0x6a09e667);
  const outer=makeLinearTransform(seed^0xbb67ae85);
  const polySeed=seed^0x3c6ef372;
  const p=makeRivestPermutation(3,polySeed);
  const coefficients=rivestCoefficients(polySeed);
  const next=makeRng(seed^0xa54ff53a);
  const innerOffset=next(),outerOffset=next(),secret=next();
  /** @param {number} x @returns {number} */
  const oracle=x=>u32(applyLinear(outer,
    p(u32(applyLinear(inner,x)^innerOffset)))^outerOffset);
  const source=[
    ...inner.map((value,index)=>'const OBFS_PRIVATE_I'+index+'='+value+';'),
    ...outer.map((value,index)=>'const OBFS_PRIVATE_O'+index+'='+value+';'),
    ...coefficients.map((value,index)=>'const OBFS_PRIVATE_C'+index+'='+value+';'),
    'const OBFS_PRIVATE_IN_OFFSET='+innerOffset+';',
    'const OBFS_PRIVATE_OUT_OFFSET='+outerOffset+';',
    'function obfsPrivateApply(columns,input){',
    '  let x=input>>>0,output=0,bit=0;',
    '  while(x!==0){if((x&1)!==0)output^=columns[bit];x>>>=1;bit++;}',
    '  return output>>>0;',
    '}',
    'function obfsPrivatePoly(x){',
    '  const coefficients=['+
      coefficients.map((_,i)=>'OBFS_PRIVATE_C'+(3-i)).join(',')+'];',
    '  let acc=0;',
    '  for(const coefficient of coefficients)',
    '    acc=(Math.imul(acc,x)+coefficient)>>>0;',
    '  return acc;',
    '}',
    'export async function protectedDenseRivest(input){',
    '  const inner=['+inner.map((_,i)=>'OBFS_PRIVATE_I'+i).join(',')+'];',
    '  const outer=['+outer.map((_,i)=>'OBFS_PRIVATE_O'+i).join(',')+'];',
    '  const z=(obfsPrivateApply(inner,input>>>0)^',
    '    OBFS_PRIVATE_IN_OFFSET)>>>0;',
    '  return (obfsPrivateApply(outer,obfsPrivatePoly(z))^',
    '    OBFS_PRIVATE_OUT_OFFSET)>>>0;',
    '}',
    'export function publicIdentity(input){return input>>>0;}'
  ].join('\n');
  return {seed,secret,target:oracle(secret),oracle,source};
}

/**
 * Direct synchronous public chosen-oracle attack in a separate worker.
 * Worker has only target, deterministic attacker seed and shared response
 * channel. The parent accepts each worker query as an actual HTTP request
 * and hands back only its validated unsigned 32-bit response.
 *
 * @param {{origin:string,method:string,token:string}} access
 * @param {number} target
 * @param {number} attackerSeed
 * @returns {Promise<{value:number,queries:number,method:string,
 *   transcriptHash:string,failedCount:number}>}
 */
async function invertOverHttp(access,target,attackerSeed) {
  const buffer=new SharedArrayBuffer(3*Int32Array.BYTES_PER_ELEMENT);
  const channel=new Int32Array(buffer);
  const transcript=createHash('sha256');
  const seen=new Map();
  const worker=new Worker(require.resolve('./sco-dense-hybrid-oracle-worker.js'),{
    workerData:{sharedBuffer:buffer,target,seed:attackerSeed}
  });
  /** @type {string|null} */
  let bridgeError=null;
  try {
    /** @type {{value:number,queries:number,method:'reanchor'|'cegar8'|'cegar128',
     *   failed:Array<{method:string,reason:string}>}} */
    const result=await new Promise((resolve,reject)=>{
      worker.on('error',reject);
      worker.on('exit',code=>{
        if(code!==0)reject(new Error('Public attacker worker exited with '+code));
      });
      worker.on('message',async message=>{
        if(message.result) {
          resolve(message.result);
          return;
        }
        const input=message.query;
        try {
          if(!Number.isInteger(input)||input<0||input>0xffffffff)
            throw new TypeError('Worker requested an invalid chosen input');
          if(!seen.has(input)) {
            const response=await fetch(access.origin+'/obfs/rpc',{
              method:'POST',
              headers:{'content-type':'application/json',
                'x-demo-session':access.token},
              body:JSON.stringify({method:access.method,args:[input]})
            });
            assert.equal(response.status,200);
            /** @type {{ok?:unknown,value?:unknown}} */
            const reply=await response.json();
            assert.equal(reply.ok,true);
            const value=reply.value;
            if(typeof value!=='number'||!Number.isInteger(value)||
              value<0||value>0xffffffff)
              throw new TypeError('Private RPC produced invalid uint32');
            seen.set(input,value);
            transcript.update(JSON.stringify([input,value])+'\n');
          }
          Atomics.store(channel,1,/** @type {number} */ (seen.get(input))|0);
          Atomics.store(channel,2,0);
        }catch(error){
          bridgeError=error instanceof Error?error.message:String(error);
          Atomics.store(channel,2,1);
        }finally{
          Atomics.store(channel,0,1);
          Atomics.notify(channel,0,1);
        }
      });
    });
    if(bridgeError!==null)throw new Error(bridgeError);
    assert.equal(result.queries,seen.size);
    return {value:result.value,queries:seen.size,method:result.method,
      transcriptHash:transcript.digest('hex'),
      failedCount:result.failed.length};
  }finally{
    await worker.terminate();
  }
}

/**
 * Live native-minified versus real generated SCO private source RPC;
 * exact source semantics are checked against an independent BigInt
 * Rivest implementation before either authenticated attack begins.
 *
 * @param {'sco'|'minified'} arm
 * @param {ReturnType<typeof fixture>} sample
 * @returns {Promise<{arm:'sco'|'minified',queries:number,method:string,
 *   exact:boolean,privateCalls:number,deniedStatus:number,
 *   transcriptHash:string,sourceLeaked:boolean,publicBytes:number,
 *   privateModuleBytes:number,verifiedInputs:number}>}
 */
async function executeArm(arm,sample) {
  const code=arm==='minified'
    ?esbuild.transformSync(sample.source,{
      loader:'js',format:'esm',target:'es2022',minify:true
    }).code
    :sample.source;
  const original=await import('data:text/javascript,'+encodeURIComponent(code));
  const next=makeRng(sample.seed^0x87c89f4b);
  const control=[0,1,0xffffffff,sample.secret,0x12345678];
  for(let i=0;i<128;i++)control.push(next());
  for(const input of control)assert.equal(
    await original.protectedDenseRivest(input),sample.oracle(input),
    'Generated/private ESM deviated from independent BigInt source'
  );
  let method='protectedDenseRivest';
  /** @type {import('node:http').Server|undefined} */
  let server;
  let privateCalls=0;
  let publicCode='';
  try {
    if(arm==='sco'){
      const selected=partitionScoSelectedAsyncExports({
        path:'dense.mjs',sourceType:'module',code:sample.source
      },{seed:'sco-dense-hybrid-matched-20261123',
        privateNames:['protectedDenseRivest']});
      const methods=bindScoModuleExports(selected,original);
      /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
      const remote=Object.create(null);
      for(const [name,fn] of Object.entries(methods))
        remote[name]=(...args)=>{privateCalls++;return fn(...args);};
      server=http.createServer(createScoHandler([selected.clientFile],{
        remoteMethods:remote,
        authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
        authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
        authorizeOperation:(req,name,args)=>
          req.headers['x-demo-session']===TOKEN&&
          name===selected.methodNames.protectedDenseRivest&&
          args.length===1&&Number.isInteger(args[0])&&
          /** @type {number} */(args[0])>=0&&
          /** @type {number} */(args[0])<=0xffffffff
      }));
    }else{
      server=http.createServer(async(req,res)=>{
        if(req.headers['x-demo-session']!==TOKEN){
          res.statusCode=403;res.end('Forbidden');return;
        }
        if(req.method!=='POST'||req.url!=='/obfs/rpc'){
          res.statusCode=404;res.end('Not found');return;
        }
        /** @type {Buffer[]} */
        const chunks=[];
        for await(const part of req)chunks.push(Buffer.from(part));
        /** @type {{method?:unknown,args?:unknown}} */
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const args=body.args;
        if(body.method!==method||!Array.isArray(args)||
          args.length!==1||typeof args[0]!=='number'||
          !Number.isInteger(args[0])||args[0]<0||args[0]>0xffffffff){
          res.statusCode=400;res.end('Bad request');return;
        }
        privateCalls++;
        const value=await original.protectedDenseRivest(args[0]);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ok:true,value}));
      });
    }
    const active=server;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',resolve);
    });
    await ready;
    const address=active.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[1]})
    });
    assert.equal(denied.status,403);
    if(arm==='sco'){
      const response=await fetch(origin+'/obfs/dense.mjs',{
        headers:{'x-demo-session':TOKEN}
      });
      assert.equal(response.status,200);
      publicCode=await response.text();
      const facade=publicCode.match(
        /export async function protectedDenseRivest\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
      );
      assert.ok(facade?.[1],'Public SCO method route not found');
      method=facade[1];
    }
    const sourceLeaked=/OBFS_PRIVATE_I\d|OBFS_PRIVATE_C\d|OBFS_PRIVATE_IN_OFFSET/u
      .test(publicCode);
    assert.equal(sourceLeaked,false);
    const result=await invertOverHttp({origin,method,token:TOKEN},
      sample.target,u32(sample.seed^0x516a1128));
    assert.equal(result.value,sample.secret);
    assert.equal(result.method,'cegar8');
    assert.equal(privateCalls,result.queries);
    return {arm,queries:result.queries,method:result.method,
      exact:true,privateCalls,deniedStatus:denied.status,
      transcriptHash:result.transcriptHash,sourceLeaked,
      publicBytes:Buffer.byteLength(publicCode),
      privateModuleBytes:Buffer.byteLength(code),
      verifiedInputs:control.length};
  }finally {
    if(server) {
      const running=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}

/**
 * @returns {Promise<{sco:Awaited<ReturnType<typeof executeArm>>,
 *   minified:Awaited<ReturnType<typeof executeArm>>,
 *   sourceHash:string,matchedTranscript:boolean,sourceSeed:number}>}
 */
async function compare() {
  const sample=fixture();
  const sco=await executeArm('sco',sample);
  const minified=await executeArm('minified',sample);
  assert.equal(sco.queries,minified.queries);
  assert.equal(sco.transcriptHash,minified.transcriptHash);
  assert.equal(sco.privateCalls,sco.queries);
  assert.equal(minified.privateCalls,minified.queries);
  assert.ok(sco.queries>=3930&&sco.queries<=4053,
    'Source-matched trial escaped independently pinned Rivest-3 range');
  return {sco,minified,
    sourceHash:createHash('sha256').update(sample.source).digest('hex'),
    matchedTranscript:true,sourceSeed:sample.seed};
}
if(require.main===module) {
  compare().then(result=>
    console.log('SCO_DENSE_HYBRID_MATCHED_HTTP '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={rivestCoefficients,fixture,invertOverHttp,executeArm,compare};
