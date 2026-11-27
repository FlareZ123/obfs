'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {masksOfWeight,learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');
const {prepareExactCubicInverter}=require('./exact-cubic-compatible-cegar');
const {makeFixture}=require('./exact-quadratic-compatible-cegar');
const {createOrdinaryOracleServer}=require('./sco-triangular-quadratic-exact-cegar');

const METHOD='protectedTriangular';
const TOKEN='authorized-quadratic-study-session';

/**
 * The trusted test fixture upgrades the existing serialized private
 * triangular source from degree <=2 to <=3 using a product of three
 * independent lower-prefix linear gates. The attacker never sees source.
 *
 * @param {number} seed
 * @returns {string}
 */
function makePrivateCubicSource(seed){
  const base=makeFixture(seed).privateSource;
  const original='const nonlinear=parity32(lower&spec.a)^(parity32(lower&spec.b)&parity32(lower&spec.c))^spec.constant;';
  const cubic='const nonlinear=parity32(lower&spec.a)^(parity32(lower&spec.b)&parity32(lower&spec.c))^(parity32(lower&spec.a)&parity32(lower&spec.b)&parity32(lower&spec.c))^spec.constant;';
  if(!base.includes(original))throw new Error('private source fixture spelling changed');
  return base.replace(original,cubic);
}

/**
 * Attacker-only functionality. Authenticate to a selected numeric oracle,
 * record the Q(32,3)=5489 low-weight evaluations, and obtain the exact
 * cubic ANF using solely the observed request/response transcript.
 *
 * @param {{origin:string,method:string,credential:string}} access
 * @returns {Promise<{model:ReturnType<typeof learnBoundedDegreeOracle>,
 *   queryCount:number,transcriptSha256:string}>}
 */
async function cloneAuthorizedCubic(access){
  /** @type {Map<number,number>} */
  const replies=new Map();
  const hash=createHash('sha256');
  for(let weight=0;weight<=3;weight++){
    for(const input of masksOfWeight(32,weight)){
      const response=await fetch(access.origin+'/obfs/rpc',{
        method:'POST',headers:{
          'content-type':'application/json','x-demo-session':access.credential
        },
        body:JSON.stringify({method:access.method,args:[input]})
      });
      assert.equal(response.status,200,'authorized chosen input was rejected');
      /** @type {{ok?:boolean,value?:unknown}} */
      const body=await response.json();
      assert.equal(body.ok,true);
      const value=body.value;
      assert.ok(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<2**32);
      replies.set(input,value);
      hash.update(JSON.stringify([input,value])+'\n');
    }
  }
  const model=learnBoundedDegreeOracle(input=>{
    const value=replies.get(input);
    if(value===undefined)throw new Error('unobserved training input');
    return value;
  },32,3);
  assert.equal(replies.size,5489);
  assert.equal(model.queryCount,5489);
  return{model,queryCount:replies.size,transcriptSha256:hash.digest('hex')};
}

/** @param {import('node:http').Server} server @returns {Promise<string>} */
function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string')return reject(new Error('missing address'));
      resolve('http://127.0.0.1:'+address.port);
    });
  });
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
function close(server){
  return new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * Compare private generated SCO RPC against an equally trusted ordinary
 * authenticated Node HTTP oracle with the same private ESM module, route,
 * credential, per-request argument policy, and value envelope. Shut down
 * both servers before held-out functional cloning and inverse checks.
 *
 * @param {{seed?:number,holdouts?:number,targets?:number}} [options]
 * @returns {Promise<{scoQueries:number,ordinaryQueries:number,
 *   scoPrivateExecutions:number,ordinaryPrivateExecutions:number,
 *   deniedScoStatus:number,deniedOrdinaryStatus:number,
 *   transcriptMatched:boolean,degreeThreeCoefficients:number,
 *   holdouts:number,holdoutMatches:number,targets:number,
 *   exactInversions:number,offlineAfterBothServersClosed:boolean,
 *   publicPrivateMarkerLeaked:boolean,offlineContractions:number,
 *   transcriptSha256:string,privateSourceSha256:string}>}
 */
async function runChallenge(options={}){
  const seed=options.seed??0x71420000;
  const holdouts=options.holdouts??256;
  const targets=options.targets??16;
  const source=makePrivateCubicSource(seed);
  const selected=partitionScoAsyncModule({
    path:'triangular.mjs',sourceType:'module',code:source
  },{seed:'sco-compatible-cubic-exact-cegar',serverOnlyInitialization:true});
  const publicCode=selected.clientFile.code;
  const privateMarker=/TRIANGULAR_SPECS|INNER_COLUMNS|OUTER_COLUMNS|INNER_OFFSET|OUTPUT_OFFSET/u;
  assert.equal(privateMarker.test(publicCode),false);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  /** @type {(value:number)=>Promise<number>} */
  const oracle=original[METHOD];
  const privateMethods=bindScoModuleExports(selected,original);
  const scoCounters={executions:0};
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const instrumented=Object.create(null);
  for(const [name,task] of Object.entries(privateMethods)){
    instrumented[name]=async(...args)=>{
      scoCounters.executions++;
      return task(...args);
    };
  }
  const ordinaryCounters={executions:0};
  /** @type {import('node:http').Server|undefined} */
  let scoServer;
  /** @type {import('node:http').Server|undefined} */
  let ordinaryServer;
  try{
    scoServer=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:instrumented,
      authorizeRead:request=>request.headers['x-demo-session']===TOKEN,
      authorizeRpc:request=>request.headers['x-demo-session']===TOKEN,
      authorizeOperation:(request,method,args)=>{
        const value=args[0];
        return request.headers['x-demo-session']===TOKEN&&
          method===selected.methodNames[METHOD]&&args.length===1&&
          typeof value==='number'&&Number.isInteger(value)&&
          value>=0&&value<2**32;
      }
    }));
    ordinaryServer=createOrdinaryOracleServer(oracle,ordinaryCounters,selected.methodNames[METHOD]);
    const [scoOrigin,ordinaryOrigin]=await Promise.all([listen(scoServer),listen(ordinaryServer)]);
    const denyQuery={method:selected.methodNames[METHOD],args:[7]};
    const denied=await Promise.all([scoOrigin,ordinaryOrigin].map(origin=>
      fetch(origin+'/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(denyQuery)
      })
    ));
    assert.equal(denied[0].status,403);
    assert.equal(denied[1].status,403);

    const publication=await fetch(scoOrigin+'/obfs/triangular.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(publication.status,200);
    const delivered=await publication.text();
    assert.equal(delivered,publicCode);
    // The attacker extracts the hashed route from actually distributed bytes.
    const route=delivered.match(
      /export async function protectedTriangular\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
    );
    assert.ok(route?.[1],'private method route must appear in public facade');
    assert.equal(route[1],selected.methodNames[METHOD]);

    const [scoClone,ordinaryClone]=await Promise.all([
      cloneAuthorizedCubic({origin:scoOrigin,method:route[1],credential:TOKEN}),
      cloneAuthorizedCubic({origin:ordinaryOrigin,method:route[1],credential:TOKEN})
    ]);
    assert.equal(scoCounters.executions,5489);
    assert.equal(ordinaryCounters.executions,5489);
    assert.equal(scoClone.transcriptSha256,ordinaryClone.transcriptSha256);

    if(!scoServer||!ordinaryServer)throw new Error('both servers must close');
    await Promise.all([close(scoServer),close(ordinaryServer)]);
    scoServer=undefined;ordinaryServer=undefined;

    const degreeThreeCoefficients=scoClone.model.coefficients.filter(([mask,value])=>{
      let x=mask>>>0,weight=0;
      while(x!==0){x&=x-1;weight++;}
      return weight===3&&value!==0;
    }).length;
    assert.ok(degreeThreeCoefficients>0,'source must have genuine cubic degree');
    const inverter=prepareExactCubicInverter(scoClone.model);
    const nextSeed=seed^0x7f4a7c15;
    const {makeRng}=require('./compatible-permutation-linear-sandwich-blackbox');
    const next=makeRng(nextSeed);
    let holdoutMatches=0;
    for(let index=0;index<holdouts;index++){
      const value=next();
      const expected=(await oracle(value))>>>0;
      if(evaluateBoundedDegreeModel(scoClone.model,value)===expected&&
         evaluateBoundedDegreeModel(ordinaryClone.model,value)===expected){
        holdoutMatches++;
      }
    }
    assert.equal(holdoutMatches,holdouts);
    let exactInversions=0;
    for(let index=0;index<targets;index++){
      const hidden=next();
      const target=(await oracle(hidden))>>>0;
      if(inverter.invert(target)===hidden)exactInversions++;
    }
    assert.equal(exactInversions,targets);
    assert.equal(scoCounters.executions,5489);
    assert.equal(ordinaryCounters.executions,5489);
    return{
      scoQueries:scoClone.queryCount,
      ordinaryQueries:ordinaryClone.queryCount,
      scoPrivateExecutions:scoCounters.executions,
      ordinaryPrivateExecutions:ordinaryCounters.executions,
      deniedScoStatus:denied[0].status,
      deniedOrdinaryStatus:denied[1].status,
      transcriptMatched:true,
      degreeThreeCoefficients,holdouts,holdoutMatches,targets,exactInversions,
      offlineAfterBothServersClosed:true,
      publicPrivateMarkerLeaked:privateMarker.test(publicCode),
      offlineContractions:inverter.offlineContractions,
      transcriptSha256:scoClone.transcriptSha256,
      privateSourceSha256:createHash('sha256').update(source).digest('hex')
    };
  }finally{
    if(scoServer)await close(scoServer);
    if(ordinaryServer)await close(ordinaryServer);
  }
}

if(require.main===module){
  runChallenge().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;});
}

module.exports={makePrivateCubicSource,cloneAuthorizedCubic,runChallenge};
