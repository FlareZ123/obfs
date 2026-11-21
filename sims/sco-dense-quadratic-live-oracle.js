'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const execFileAsync=promisify(execFile);
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');
const {cloneAuthorizedQuadratic}=require('./sco-quadratic-529-live-clone');
const {masksOfWeight,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');
const {basis}=require('./quadratic-radical-target-inversion');

const TOKEN='authorized-dense-quadratic-study-session';

/**
 * Produce a complete, independently randomized 32-input/32-output Boolean
 * quadratic function. The original source embeds 529 independent uint32
 * coefficients in a local private function array. Source code is never
 * passed to the public learner; the verifier retains it for held-out tests.
 *
 * @returns {{coefficients:number[],source:string}}
 */
function randomPrivateQuadratic(){
  const random=randomBytes(529*4);
  /** @type {number[]} */
  const coefficients=[];
  for(let i=0;i<529;i++)coefficients.push(random.readUInt32BE(i*4));
  const source=[
    'export async function protectedDense(value){',
    '  const OBFS_PRIVATE_DENSE_COEFFICIENTS=['+coefficients.join(',')+'];',
    '  const x=value>>>0;',
    '  let result=OBFS_PRIVATE_DENSE_COEFFICIENTS[0],index=1;',
    '  for(let i=0;i<32;i++){',
    '    if((x>>>i)&1)result^=OBFS_PRIVATE_DENSE_COEFFICIENTS[index];',
    '    index++;',
    '  }',
    '  for(let i=0;i<32;i++){',
    '    for(let j=i+1;j<32;j++){',
    '      if(((x>>>i)&1)&&((x>>>j)&1))',
    '        result^=OBFS_PRIVATE_DENSE_COEFFICIENTS[index];',
    '      index++;',
    '    }',
    '  }',
    '  return result>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
  return {coefficients,source};
}

/**
 * An actual authenticated SCO server retains a full 16,928-bit
 * source-parameter family rather than a two-rotation low-parameter family.
 * The attacker knows the degree-two class and the served ESM route only.
 * The generic 529-query interpolation model must recover every source
 * coefficient exactly and work after the HTTP service is closed.
 *
 * @returns {Promise<{
 *   queries:number,privateCalls:number,heldOut:number,matched:number,
 *   protectedIdentifiersServed:boolean,deniedStatus:number,
 *   recoveredCoefficients:number,coefficientsExactlyRecovered:boolean,
 *   nonlinearOutputRank:number,sourceBytes:number,publicBytes:number,
 *   privateSourceSha256:string,transcriptSha256:string,
 *   lastPairAmbiguityAt528Queries:boolean,serverOfflineBeforeHoldout:boolean,
 *   processIsolatedClient:boolean
 * }>}
 * @param {{processIsolatedClient?:boolean}} [options]
 */
async function runDenseChallenge(options={}){
  const processIsolatedClient=options.processIsolatedClient===true;
  const {coefficients,source}=randomPrivateQuadratic();
  const selected=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'sco-dense-quadratic-20261121',privateNames:['protectedDense']});
  const publishedSource=selected.clientFile.code;
  const protectedIdentifiersServed=publishedSource.includes('OBFS_PRIVATE_DENSE_COEFFICIENTS');
  assert.equal(protectedIdentifiersServed,false);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(selected,original);
  let privateCalls=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const counted=Object.create(null);
  for(const [name,fn] of Object.entries(methods)){
    counted[name]=(...args)=>{
      privateCalls++;
      return fn(...args);
    };
  }
  /** @type {import('node:http').Server|undefined} */
  let server;
  let serverOfflineBeforeHoldout=false;
  try{
    server=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:counted,
      authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
      authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
      authorizeOperation:(req,method,args)=>
        req.headers['x-demo-session']===TOKEN&&
        method===selected.methodNames.protectedDense&&
        args.length===1&&typeof args[0]==='number'&&
        Number.isInteger(args[0])&&args[0]>=0&&args[0]<2**32
    }));
    const activeServer=server;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      activeServer.once('error',reject);
      activeServer.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:selected.methodNames.protectedDense,args:[0]})
    });
    assert.equal(denied.status,403);
    const served=await fetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(served.status,200);
    const delivered=await served.text();
    assert.equal(delivered,publishedSource);
    const route=delivered.match(
      /export async function protectedDense\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
    assert.ok(route?.[1],'Published dense private method route not recoverable');
    assert.equal(route[1],selected.methodNames.protectedDense);
    /** @type {Awaited<ReturnType<typeof cloneAuthorizedQuadratic>>} */
    let learned;
    if(processIsolatedClient){
      // The original random coefficients and private ESM remain exclusively
      // in the parent process heap; the child receives only HTTP access.
      const {stdout}=await execFileAsync(process.execPath,[
        path.join(__dirname,'sco-dense-remote-client.cjs'),origin,TOKEN
      ],{maxBuffer:512*1024,timeout:120000});
      /** @type {Awaited<ReturnType<typeof cloneAuthorizedQuadratic>> & {sourceSha256:string}} */
      const childResult=JSON.parse(stdout);
      assert.equal(childResult.sourceSha256,
        createHash('sha256').update(delivered).digest('hex'),
        'Isolated attacker did not learn from served public ESM');
      learned=childResult;
    }else{
      learned=await cloneAuthorizedQuadratic({
        origin,method:route[1],credential:TOKEN
      });
    }
    assert.equal(learned.queryCount,529);
    assert.equal(privateCalls,529);
    const originalCoefficientOrder=learned.model.coefficients.map(([,value])=>value);
    const coefficientsExactlyRecovered=originalCoefficientOrder.every(
      (value,index)=>value===coefficients[index]);
    assert.equal(coefficientsExactlyRecovered,true);
    const nonlinearOutputRank=basis(learned.model.coefficients.slice(33)
      .map(([,value])=>value),32).length;
    assert.equal(nonlinearOutputRank,32);
    // At 528 of the 529 low-weight queries, flipping the last quadratic
    // coefficient is undetectable; the omitted last two-hot input differs.
    const last=learned.model.coefficients.length-1;
    const [missingMask,coefficient]=learned.model.coefficients[last];
    const alternative={
      ...learned.model,
      coefficients:learned.model.coefficients.map(
        (entry,index)=>index===last?
          /** @type {[number,number]} */([entry[0],(coefficient^1)>>>0]):entry)
    };
    for(let weight=0;weight<=2;weight++){
      for(const input of masksOfWeight(32,weight)){
        if(input===missingMask)continue;
        assert.equal(evaluateBoundedDegreeModel(learned.model,input),
          evaluateBoundedDegreeModel(alternative,input));
      }
    }
    const query528FailsAtLast=evaluateBoundedDegreeModel(learned.model,missingMask)!==
      evaluateBoundedDegreeModel(alternative,missingMask);
    assert.equal(query528FailsAtLast,true);
    const closed=server;
    /** @type {Promise<void>} */
    const ended=new Promise((resolve,reject)=>
      closed.close(error=>error?reject(error):resolve()));
    await ended;
    server=undefined;
    serverOfflineBeforeHoldout=true;
    const heldOutInputs=[0xffffffff,0xaaaaaaaa,0x55555555,0x12345678];
    for(let i=0;i<1024;i++){
      const hash=createHash('sha256').update('dense-heldout-'+i).digest();
      heldOutInputs.push(hash.readUInt32BE(0));
    }
    let matched=0;
    for(const input of heldOutInputs){
      if(evaluateBoundedDegreeModel(learned.model,input)===
          await original.protectedDense(input))matched++;
    }
    assert.equal(matched,heldOutInputs.length);
    assert.equal(privateCalls,529);
    return {
      queries:learned.queryCount,privateCalls,
      heldOut:heldOutInputs.length,matched,
      protectedIdentifiersServed,deniedStatus:denied.status,
      recoveredCoefficients:learned.model.coefficients.length,
      coefficientsExactlyRecovered,nonlinearOutputRank,
      sourceBytes:Buffer.byteLength(source),
      publicBytes:Buffer.byteLength(publishedSource),
      privateSourceSha256:createHash('sha256').update(source).digest('hex'),
      transcriptSha256:learned.transcriptSha256,
      lastPairAmbiguityAt528Queries:query528FailsAtLast,serverOfflineBeforeHoldout,
      processIsolatedClient
    };
  }finally{
    if(server){
      const remaining=server;
      /** @type {Promise<void>} */
      const ended=new Promise((resolve,reject)=>
        remaining.close(error=>error?reject(error):resolve()));
      await ended;
    }
  }
}

if(require.main===module){
  runDenseChallenge().then(result=>
    console.log('SCO_DENSE_QUADRATIC_AUTHENTICATED '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={randomPrivateQuadratic,runDenseChallenge};
