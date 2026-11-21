'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');
const {masksOfWeight,learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');
const {basis}=require('./quadratic-radical-target-inversion');
const {cloneKnownFamily,evaluateKnownFamily}=require('./sco-quadratic-two-query');

const TOKEN='authorized-quadratic-study-session';

/**
 * The attacker receives the HTTP origin, published method identifier and its
 * own legitimate credential. It never receives a private source file, Node
 * module namespace or private-key value. All 529 fitting queries are real
 * authenticated HTTP requests. The returned model is independent of the
 * server after fitting.
 *
 * @param {{origin:string,method:string,credential:string}} access
 * @returns {Promise<{model:ReturnType<typeof learnBoundedDegreeOracle>,
 *   queryCount:number,transcriptSha256:string}>}
 */
async function cloneAuthorizedQuadratic(access){
  /** @type {Map<number,number>} */
  const observed=new Map();
  const transcript=createHash('sha256');
  for(let weight=0;weight<=2;weight++){
    for(const input of masksOfWeight(32,weight)){
      const response=await fetch(access.origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':access.credential},
        body:JSON.stringify({method:access.method,args:[input]})
      });
      assert.equal(response.status,200,'Authorized private query rejected');
      /** @type {{ok?:boolean,value?:unknown}} */
      const message=await response.json();
      assert.equal(message.ok,true);
      const value=message.value;
      assert.ok(typeof value==='number'&&Number.isInteger(value)&&
        value>=0&&value<2**32,'Private oracle returned non-uint32');
      observed.set(input,value);
      transcript.update(JSON.stringify([input,value])+'\n');
    }
  }
  const model=learnBoundedDegreeOracle(input=>{
    const value=observed.get(input);
    assert.notEqual(value,undefined,'Interpolation requested a missing query');
    return /** @type {number} */ (value);
  },32,2);
  assert.equal(observed.size,529);
  assert.equal(model.queryCount,529);
  return {model,queryCount:observed.size,
    transcriptSha256:transcript.digest('hex')};
}

/**
 * End-to-end test: the trusted SCO server keeps a different, randomly chosen
 * degree-two Boolean function body in private source. An authenticated
 * adversary learns its full 32-bit input/output behavior through 529 public
 * RPC observations. The trusted server is then shut down before any held-out
 * verification against the offline model. No source or secret recovery claim.
 *
 * @returns {Promise<{
 *   queries:number,heldout:number,matched:number,sourceSha256:string,
 *   transcriptSha256:string,privateExecutions:number,deniedStatus:number,
 *   originalBytes:number,publishedBytes:number,
 *   privateIdentifiersPublished:boolean,cubicNegativeAtSeven:boolean,
 *   nonzeroQuadraticCoefficients:number,nonlinearOutputRank:number,
 *   offlineAfterServerClose:boolean,sourceFamilyAware:boolean,
 *   sourceFamilyCandidatePairs:number
 * }>}
 * @param {{sourceFamilyAware?:boolean}} [options]
 */
async function runChallenge(options={}){
  const sourceFamilyAware=options.sourceFamilyAware===true;
  const raw=randomBytes(2);
  let a=1+raw[0]%31;
  // Avoid the (8,16,24) shift subfamily with output residual rank 24.
  if(a%8===0)a++;
  // Distinct shifts provide genuine quadratic terms.
  const b=1+(a+raw[1]%30)%31;
  const constant=randomBytes(4).readUInt32BE(0);
  const source=[
    'const OBFS_PRIVATE_ROTATE_A='+a+';',
    'const OBFS_PRIVATE_ROTATE_B='+b+';',
    'const OBFS_PRIVATE_OFFSET='+constant+';',
    'export async function protectedQuadratic(value){',
    '  const x=value>>>0;',
    '  const p=(x^(x<<OBFS_PRIVATE_ROTATE_A)^(x>>>(32-OBFS_PRIVATE_ROTATE_A)))>>>0;',
    '  const q=(x^(x<<OBFS_PRIVATE_ROTATE_B)^(x>>>(32-OBFS_PRIVATE_ROTATE_B)))>>>0;',
    '  return (p^(p&q)^OBFS_PRIVATE_OFFSET)>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
  const selected=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'sco-quadratic-authenticated-clone',privateNames:['protectedQuadratic']});
  const publicCode=selected.clientFile.code;
  const leaked=/OBFS_PRIVATE_ROTATE_A|OBFS_PRIVATE_ROTATE_B|OBFS_PRIVATE_OFFSET/u
    .test(publicCode);
  assert.equal(leaked,false,'Private implementation leaked to public facade');
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const privateMethods=bindScoModuleExports(selected,original);
  let privateExecutions=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const instrumented=Object.create(null);
  for(const [name,fn] of Object.entries(privateMethods)){
    instrumented[name]=(...args)=>{
      privateExecutions++;
      return fn(...args);
    };
  }
  /** @type {import('node:http').Server|undefined} */
  let server;
  let offlineAfterServerClose=false;
  try{
    server=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:instrumented,
      authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
      authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
      authorizeOperation:(req,method,args)=>
        req.headers['x-demo-session']===TOKEN&&
        method===selected.methodNames.protectedQuadratic&&
        args.length===1&&Number.isInteger(args[0])&&
        /** @type {number} */ (args[0])>=0&&
        /** @type {number} */ (args[0])<2**32
    }));
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        method:selected.methodNames.protectedQuadratic,args:[7]
      })
    });
    assert.equal(denied.status,403,'Unauthorized RPC must remain denied');
    const published=await fetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(published.status,200);
    const deliveredSource=await published.text();
    assert.equal(deliveredSource,publicCode);
    // Derive the route from actually distributed bytes. The attacker does
    // not receive the trusted compiler's selected.methodNames metadata.
    const route=deliveredSource.match(
      /export async function protectedQuadratic\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
    assert.ok(route?.[1],'Published facade method route not recoverable');
    const publicMethod=route[1];
    assert.equal(publicMethod,selected.methodNames.protectedQuadratic);
    const access={origin,method:publicMethod,credential:TOKEN};
    /** @type {ReturnType<typeof learnBoundedDegreeOracle>} */
    let learnedModel;
    /** @type {(input:number)=>number} */
    let offlineEvaluate;
    let queryCount=0;
    let transcriptSha256='';
    let sourceFamilyCandidatePairs=0;
    if(sourceFamilyAware){
      const recovered=await cloneKnownFamily(access);
      queryCount=recovered.queryCount;
      transcriptSha256=recovered.transcriptSha256;
      sourceFamilyCandidatePairs=recovered.candidatePairs;
      offlineEvaluate=input=>evaluateKnownFamily(input,recovered.model);
      learnedModel=learnBoundedDegreeOracle(offlineEvaluate,32,2);
      // This verifier alone retains the hidden source parameters; the
      // attacker inferred them from its two legitimate RPC responses.
      assert.deepEqual(recovered.model,{a,b,offset:constant});
    }else{
      const recovered=await cloneAuthorizedQuadratic(access);
      queryCount=recovered.queryCount;
      transcriptSha256=recovered.transcriptSha256;
      learnedModel=recovered.model;
      offlineEvaluate=input=>evaluateBoundedDegreeModel(learnedModel,input);
    }
    assert.equal(privateExecutions,queryCount);
    const nonzeroQuadraticCoefficients=learnedModel.coefficients
      .slice(33).filter(([,value])=>value!==0).length;
    assert.ok(nonzeroQuadraticCoefficients>0,'Expected genuine degree-two target');
    const nonlinearOutputRank=basis(learnedModel.coefficients.slice(33)
      .map(([,value])=>value),32).length;
    assert.equal(nonlinearOutputRank,32,'Expected full quadratic output rank');
    const closed=server;
    /** @type {Promise<void>} */
    const done=new Promise((resolve,reject)=>
      closed.close(error=>error?reject(error):resolve()));
    await done;
    server=undefined;
    offlineAfterServerClose=true;
    // Values of weight >=3 were never fitting-oracle inputs.
    const selectedInputs=[0xffffffff,0xaaaaaaaa,0x55555555,0x12345678];
    for(let index=0;index<1024;index++){
      const digest=createHash('sha256').update('heldout-'+index).digest();
      selectedInputs.push(digest.readUInt32BE(0));
    }
    let matched=0;
    for(const input of selectedInputs){
      if(offlineEvaluate(input)===
          await original.protectedQuadratic(input))matched++;
    }
    assert.equal(matched,selectedInputs.length);
    assert.equal(privateExecutions,queryCount,'Offline verifier made unexpected RPC call');
    // An intentionally cubic function agrees with its zero quadratic model
    // on every <=2-weight fitting query, but fails on the unqueried 0b111.
    const cubic=learnBoundedDegreeOracle(input=>
      (input&7)===7?1:0,32,2);
    const cubicNegativeAtSeven=evaluateBoundedDegreeModel(cubic,7)!==1;
    assert.equal(cubicNegativeAtSeven,true);
    return {
      queries:queryCount,heldout:selectedInputs.length,matched,
      sourceSha256:createHash('sha256').update(source).digest('hex'),
      transcriptSha256,
      privateExecutions,deniedStatus:denied.status,
      originalBytes:Buffer.byteLength(source),
      publishedBytes:Buffer.byteLength(publicCode),
      privateIdentifiersPublished:leaked,cubicNegativeAtSeven,
      nonzeroQuadraticCoefficients,nonlinearOutputRank,
      offlineAfterServerClose,sourceFamilyAware,sourceFamilyCandidatePairs
    };
  }finally{
    if(server){
      /** @type {Promise<void>} */
      const done=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await done;
    }
  }
}

if(require.main===module){
  runChallenge().then(result=>
    console.log('SCO_QUADRATIC_529_LIVE_CLONE '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runChallenge,cloneAuthorizedQuadratic};
