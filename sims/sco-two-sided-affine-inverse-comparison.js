'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const esbuild=require('esbuild');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {cloneAuthorizedQuadratic}=require('./sco-quadratic-529-live-clone');
const {inverseFromBoundedDegreeModel}=
  require('./two-sided-affine-degree-inversion');
const {invertQuadraticAffineTriangularModel}=
  require('./quadratic-affine-triangular-inverse');

const TOKEN='authorized-triangular-inverse-comparison';

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let state=(seed>>>0)||0x9e3779b9;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/** @param {()=>number} next @returns {{columns:number[],bias:number}} */
function randomAffine(next) {
  const columns=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let k=0;k<32*12;k++) {
    const a=next()%32,b=next()%32;
    if(a===b)continue;
    if(next()&1)columns[a]=(columns[a]^columns[b])>>>0;
    else [columns[a],columns[b]]=[columns[b],columns[a]];
  }
  return {columns,bias:next()};
}

/**
 * The random private matrices, ANF coefficients and seed never enter the
 * attacker-side clone or inverse utilities. Public scripts contain only
 * the compiler-produced RPC facade. Every coordinate remains triangular,
 * and degree at most two, despite full unknown input and output affine maps.
 *
 * @param {number} seed
 * @returns {string}
 */
function privateSource(seed) {
  const next=seeded(seed),inner=randomAffine(next),outer=randomAffine(next);
  /** @type {number[]} */
  const linear=[];
  /** @type {number[][][]} */
  const pairs=[];
  for(let bit=0;bit<32;bit++) {
    linear.push(next()&(bit===0?0:(2**bit-1)>>>0));
    /** @type {number[][]} */
    const pair=[];
    if(bit>=2)for(let j=0;j<Math.min(6,bit*bit);j++) {
      const a=next()%bit,b=next()%bit;
      if(a!==b)pair.push([a,b]);
    }
    pairs.push(pair);
  }

  return [
    'export async function protectedTriangular(input){',
    'const OBFS_PRIVATE_INNER='+JSON.stringify(inner.columns)+';',
    'const OBFS_PRIVATE_OUTER='+JSON.stringify(outer.columns)+';',
    'const OBFS_PRIVATE_BIAS_IN='+inner.bias+';',
    'const OBFS_PRIVATE_BIAS_OUT='+outer.bias+';',
    'const OBFS_PRIVATE_LINEAR='+JSON.stringify(linear)+';',
    'const OBFS_PRIVATE_PAIRS='+JSON.stringify(pairs)+';',
    'function multiply(columns,word){let result=0;for(let bit=0;bit<32;bit++){'+
      'if((word>>>bit)&1)result^=columns[bit];}return result>>>0;}',
    'function parity(word){let n=word>>>0;n^=n>>>16;n^=n>>>8;n^=n>>>4;'+
      'return (0x6996>>>(n&15))&1;}',
    'const z=(multiply(OBFS_PRIVATE_INNER,input>>>0)^OBFS_PRIVATE_BIAS_IN)>>>0;',
    'let y=z;',
    'for(let bit=0;bit<32;bit++){let change=parity(z&OBFS_PRIVATE_LINEAR[bit]);'+
      'for(const pair of OBFS_PRIVATE_PAIRS[bit]){' +
      'change^=((z>>>pair[0])&1)&((z>>>pair[1])&1);}' +
      'if(change)y=(y^(1<<bit))>>>0;}',
    'return (multiply(OBFS_PRIVATE_OUTER,y)^OBFS_PRIVATE_BIAS_OUT)>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
}

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function listen(server) {
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return 'http://127.0.0.1:'+address.port;
}
/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function stop(server) {
  /** @type {Promise<void>} */
  const ended=new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
  });
  await ended;
}

/**
 * An ordinary equal-trust minified private API: no SCO compiler, but the
 * same private function, credential policy and JSON operation interface.
 * Its implementation is not published to the client.
 *
 * @param {(input:number)=>Promise<number>} privateMethod
 * @param {()=>void} onCall
 * @returns {import('node:http').RequestListener}
 */
function plainPrivateHandler(privateMethod,onCall) {
  return async(request,response)=>{
    /** @param {number} status @param {object} body */
    const reply=(status,body)=>{
      response.writeHead(status,{'content-type':'application/json'});
      response.end(JSON.stringify(body));
    };
    if(request.method!=='POST'||request.url!=='/obfs/rpc') {
      reply(404,{ok:false,error:'Not found'});
      return;
    }
    if(request.headers['x-demo-session']!==TOKEN) {
      reply(403,{ok:false,error:'Forbidden'});
      return;
    }
    try {
      let raw='';
      for await(const chunk of request) {
        raw+=String(chunk);
        if(raw.length>65536) {
          reply(413,{ok:false,error:'Too large'});return;
        }
      }
      /** @type {{method?:unknown,args?:unknown}} */
      const body=JSON.parse(raw);
      if(!body||body.method!=='protectedTriangular'||!Array.isArray(body.args)||
         body.args.length!==1||!Number.isSafeInteger(body.args[0])||
         body.args[0]<0||body.args[0]>0xffffffff) {
        reply(400,{ok:false,error:'Invalid request'});
        return;
      }
      onCall();
      const value=await privateMethod(/** @type {number} */(body.args[0]));
      reply(200,{ok:true,value});
    }catch(error) {
      if(!response.headersSent)reply(500,{ok:false,error:'Operation failed'});
      else response.destroy();
    }
  };
}

/**
 * A source-family-controlled SCO-vs-ordinary private API comparison.
 * Attacker clients receive only published facades, legitimate credentials
 * and 529 forward HTTP responses. Both services are stopped before the
 * attacker-side models invert the independently selected hidden preimages.
 * This demonstrates an attacker capability, not permission bypass, source
 * recovery, or 2.5x compute compliance.
 *
 * @returns {Promise<{
 *   seed:number,sourceDigest:string,originalBytes:number,publishedBytes:number,
 *   privateSourceLeaked:boolean,deniedSco:number,deniedOrdinary:number,
 *   scoQueries:number,ordinaryQueries:number,scoPrivateExecutions:number,
 *   ordinaryPrivateExecutions:number,modelsEqual:boolean,
 *   matchedTargets:number,heldoutTargets:number,
 *   scoOfflineLocalEvaluations:number,ordinaryOfflineLocalEvaluations:number,
 *   stoppedBeforeInversion:boolean
 * }>}
 */
async function runComparison() {
  const seed=randomBytes(4).readUInt32BE(0);
  const source=privateSource(seed);
  const sourceDigest=createHash('sha256').update(source).digest('hex');
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const minified=esbuild.transformSync(source,{
    loader:'js',format:'esm',target:'es2022',minify:true
  }).code;
  const ordinary=await import('data:text/javascript,'+encodeURIComponent(minified));
  const selected=partitionScoSelectedAsyncExports({
    path:'triangular.mjs',sourceType:'module',code:source
  },{seed:'coincident-conditional-two-sided-20261123',
    privateNames:['protectedTriangular']});
  const publicCode=selected.clientFile.code;
  const privateSourceLeaked=/OBFS_PRIVATE_INNER|OBFS_PRIVATE_OUTER|OBFS_PRIVATE_PAIRS/u
    .test(publicCode);
  assert.equal(privateSourceLeaked,false,
    'SCO public facade must not publish server-private matrices and polynomial');

  const allMethods=bindScoModuleExports(selected,original);
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const wrapped=Object.create(null);
  let scoPrivateExecutions=0,ordinaryPrivateExecutions=0;
  for(const [method,fn] of Object.entries(allMethods)) {
    wrapped[method]=(...args)=>{
      scoPrivateExecutions++;
      return fn(...args);
    };
  }

  /** @type {import('node:http').Server|undefined} */
  let scoServer;
  /** @type {import('node:http').Server|undefined} */
  let ordinaryServer;
  let scoOrigin='',ordinaryOrigin='';
  let deniedSco=0,deniedOrdinary=0;
  /** @type {Awaited<ReturnType<typeof cloneAuthorizedQuadratic>>|undefined} */
  let scoClone,ordinaryClone;
  const privateMethod=original.protectedTriangular;
  assert.equal(typeof privateMethod,'function');
  assert.equal(typeof ordinary.protectedTriangular,'function');
  try {
    scoServer=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:wrapped,
      authorizeRead:request=>request.headers['x-demo-session']===TOKEN,
      authorizeRpc:request=>request.headers['x-demo-session']===TOKEN,
      authorizeOperation:(request,method,args)=>
        request.headers['x-demo-session']===TOKEN&&
        method===selected.methodNames.protectedTriangular&&
        args.length===1&&Number.isSafeInteger(args[0])&&
        /** @type {number} */(args[0])>=0&&
        /** @type {number} */(args[0])<=0xffffffff
    }));
    ordinaryServer=http.createServer(
      plainPrivateHandler(ordinary.protectedTriangular,()=>{ordinaryPrivateExecutions++;})
    );
    scoOrigin=await listen(scoServer);
    ordinaryOrigin=await listen(ordinaryServer);
    const unauthorizedBody=JSON.stringify({method:'protectedTriangular',args:[3]});
    const denied1=await fetch(scoOrigin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},body:unauthorizedBody
    });
    const denied2=await fetch(ordinaryOrigin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},body:unauthorizedBody
    });
    deniedSco=denied1.status;
    deniedOrdinary=denied2.status;
    assert.equal(deniedSco,403);
    assert.equal(deniedOrdinary,403);

    const delivered=await fetch(scoOrigin+'/obfs/triangular.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(delivered.status,200);
    assert.equal(await delivered.text(),publicCode);
    const route=publicCode.match(
      /export async function protectedTriangular\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
    );
    assert.ok(route?.[1],'Attacker must derive the live SCO method from public bytes');

    // Two independent, genuinely authorized HTTP learners (not in-process
    // fake oracles), against the same private algorithm and policy.
    scoClone=await cloneAuthorizedQuadratic({
      origin:scoOrigin,method:route[1],credential:TOKEN
    });
    ordinaryClone=await cloneAuthorizedQuadratic({
      origin:ordinaryOrigin,method:'protectedTriangular',credential:TOKEN
    });
    assert.equal(scoClone.queryCount,529);
    assert.equal(ordinaryClone.queryCount,529);
    assert.equal(scoPrivateExecutions,529);
    assert.equal(ordinaryPrivateExecutions,529);
    assert.deepEqual(scoClone.model.coefficients,ordinaryClone.model.coefficients,
      'Same private function must induce identical learned coefficients');
    assert.ok(scoClone.model.coefficients.slice(33).some(([,coefficient])=>coefficient!==0),
      'The protected workload must have genuine nonzero quadratic work');

    await stop(scoServer);scoServer=undefined;
    await stop(ordinaryServer);ordinaryServer=undefined;
    const attackerSco=inverseFromBoundedDegreeModel(scoClone.model);
    const attackerOrdinary=inverseFromBoundedDegreeModel(ordinaryClone.model);
    assert.equal(attackerSco.trainingQueries,529);
    assert.equal(attackerOrdinary.trainingQueries,529);

    const samples=[0xffffffff,0xaaaaaaaa,0x12345678,0x55555555];
    for(let i=0;i<12;i++) {
      const digest=createHash('sha256').update(sourceDigest+'/'+i).digest();
      samples.push(digest.readUInt32BE(0));
    }
    let matchedTargets=0,scoOfflineLocalEvaluations=0,ordinaryOfflineLocalEvaluations=0;
    let fastScoLocalEvaluations=0,fastOrdinaryLocalEvaluations=0;
    let fastScoLinearSystems=0,fastOrdinaryLinearSystems=0;
    for(const hidden of samples) {
      // Verifier-only target generation; no HTTP and no input disclosure to
      // either attacker-side inverse. Values are independent of fit inputs.
      const target=await privateMethod(hidden);
      const candidateSco=attackerSco.invert(target);
      const candidateOrdinary=attackerOrdinary.invert(target);
      assert.equal(candidateSco?.input,hidden,
        'Attacker must recover SCO private-source preimage after server shutdown');
      assert.equal(candidateOrdinary?.input,hidden,
        'Same task on minified ordinary private baseline must also be recoverable');
      const fastSco=invertQuadraticAffineTriangularModel(scoClone.model,target);
      const fastOrdinary=invertQuadraticAffineTriangularModel(ordinaryClone.model,target);
      assert.equal(fastSco?.input,hidden,'Coefficient-only SCO inverse mismatch');
      assert.equal(fastOrdinary?.input,hidden,'Coefficient-only ordinary inverse mismatch');
      assert.ok(fastSco&&fastOrdinary);
      fastScoLocalEvaluations+=fastSco.localModelEvaluations;
      fastOrdinaryLocalEvaluations+=fastOrdinary.localModelEvaluations;
      fastScoLinearSystems+=fastSco.linearSystemsSolved;
      fastOrdinaryLinearSystems+=fastOrdinary.linearSystemsSolved;
      assert.ok(candidateSco&&candidateOrdinary);
      matchedTargets++;
      scoOfflineLocalEvaluations+=candidateSco.localEvaluations;
      ordinaryOfflineLocalEvaluations+=candidateOrdinary.localEvaluations;
    }
    assert.equal(scoPrivateExecutions,529);
    assert.equal(ordinaryPrivateExecutions,529);
    return {
      seed,sourceDigest,originalBytes:Buffer.byteLength(source),
      publishedBytes:Buffer.byteLength(publicCode),
      privateSourceLeaked,deniedSco,deniedOrdinary,
      scoQueries:scoClone.queryCount,ordinaryQueries:ordinaryClone.queryCount,
      scoPrivateExecutions,ordinaryPrivateExecutions,
      modelsEqual:true,matchedTargets,heldoutTargets:samples.length,
      scoOfflineLocalEvaluations,ordinaryOfflineLocalEvaluations,
      fastScoLocalEvaluations,fastOrdinaryLocalEvaluations,
      fastScoLinearSystems,fastOrdinaryLinearSystems,
      stoppedBeforeInversion:true
    };
  }finally {
    if(scoServer)await stop(scoServer);
    if(ordinaryServer)await stop(ordinaryServer);
  }
}

if(require.main===module){
  runComparison().then(result=>console.log('SCO_TWO_SIDED_AFFINE_CLONE_INVERSE '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={privateSource,runComparison};
