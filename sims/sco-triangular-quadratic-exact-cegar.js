'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {
  partitionScoAsyncModule,
  bindScoModuleExports,
  createScoHandler,
}=require('../src');
const {cloneAuthorizedQuadratic}=require('./sco-quadratic-529-live-clone');
const {makeFixture,makeQuadraticModelEvaluator,prepareExactQuadraticInverter,polarRadicalDimensions}=
  require('./exact-quadratic-compatible-cegar');

const TOKEN='authorized-quadratic-study-session';
const METHOD='protectedTriangular';

/**
 * Start a conventional same-trust JSON RPC service. It exposes the same
 * private callable, credential, method identifier, argument policy and
 * response envelope as the SCO arm; only the serving mechanism differs.
 * @param {(input:number)=>number|Promise<number>} oracle
 * @param {{executions:number}} counters
 * @param {string} [methodName]
 * @returns {import('node:http').Server}
 */
function createOrdinaryOracleServer(oracle,counters,methodName=METHOD){
  return http.createServer(async(request,response)=>{
    if(request.method!=='POST'||request.url!=='/obfs/rpc'){
      response.writeHead(404).end();return;
    }
    if(request.headers['x-demo-session']!==TOKEN){
      response.writeHead(403).end();return;
    }
    /** @type {Buffer[]} */
    const chunks=[];
    for await(const chunk of request)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    /** @type {{method?:unknown,args?:unknown}} */
    let query;
    try{query=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch(error){response.writeHead(400).end();return;}
    if(!query||query.method!==methodName||!Array.isArray(query.args)||
        query.args.length!==1||!Number.isInteger(query.args[0])||
        query.args[0]<0||query.args[0]>=2**32){
      response.writeHead(403).end();return;
    }
    counters.executions+=1;
    const value=(await oracle(query.args[0]))>>>0;
    response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    response.end(JSON.stringify({ok:true,value}));
  });
}

/**
 * Listen on an ephemeral loopback port.
 * @param {import('node:http').Server} server
 * @returns {Promise<string>}
 */
function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string')return reject(new Error('missing TCP address'));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

/**
 * Close a listening server and wait for its sockets to settle.
 * @param {import('node:http').Server} server
 * @returns {Promise<void>}
 */
function close(server){return new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

/**
 * Exercise a live SCO oracle and an equal-trust ordinary RPC control. The
 * attacker makes 529 legitimate requests to each service, then both servers
 * close before the exact local CEGAR inversion and held-out comparisons.
 *
 * @param {{seed?:number,targets?:number,holdouts?:number}} [options]
 * @returns {Promise<{scoQueries:number,ordinaryQueries:number,scoPrivateExecutions:number,ordinaryPrivateExecutions:number,deniedScoStatus:number,deniedOrdinaryStatus:number,transcriptMatched:boolean,holdouts:number,holdoutMatches:number,targets:number,exactInversions:number,offlineDefectEvaluations:number,radicalDimension:number,radicalCodimension:number,offlineAfterBothServersClosed:boolean,publicPrivateMarkerLeaked:boolean,transcriptSha256:string,privateSourceSha256:string}>}
 */
async function runChallenge(options={}){
  const seed=options.seed??0x71000000;
  const targets=options.targets??20;
  const holdouts=options.holdouts??1028;
  const fixture=makeFixture(seed);
  const fixtureOracle=fixture.oracle;
  const source=fixture.privateSource;
  const selected=partitionScoAsyncModule({
    path:'triangular.mjs',sourceType:'module',code:source
  },{seed:'sco-compatible-quadratic-exact-cegar',serverOnlyInitialization:true});
  const publicCode=selected.clientFile.code;
  const privateMarker=/TRIANGULAR_SPECS|INNER_COLUMNS|OUTER_COLUMNS|INNER_OFFSET|OUTPUT_OFFSET/u;
  assert.equal(privateMarker.test(publicCode),false);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  /** @type {(input:number)=>Promise<number>} */
  const oracle=original[METHOD];
  for(let i=0;i<32;i+=1){
    const input=fixture.secret();
    assert.equal(await oracle(input),fixtureOracle(input),'Private module source diverged from fixture oracle');
  }
  const privateMethods=bindScoModuleExports(selected,original);
  const scoCounters={executions:0};
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const instrumented=Object.create(null);
  for(const [name,task] of Object.entries(privateMethods)){
    instrumented[name]=async(...args)=>{
      scoCounters.executions+=1;
      return task(...args);
    };
  }
  /** @type {import('node:http').Server|undefined} */
  let scoServer;
  /** @type {import('node:http').Server|undefined} */
  let ordinaryServer;
  const ordinaryCounters={executions:0};
  try{
    scoServer=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:instrumented,
      authorizeRead:request=>request.headers['x-demo-session']===TOKEN,
      authorizeRpc:request=>request.headers['x-demo-session']===TOKEN,
      authorizeOperation:(request,method,args)=>{
        const value=args[0];
        return request.headers['x-demo-session']===TOKEN&&method===selected.methodNames[METHOD]&&
          args.length===1&&typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<2**32;
      }
    }));
    ordinaryServer=createOrdinaryOracleServer(oracle,ordinaryCounters,selected.methodNames[METHOD]);
    const [scoOrigin,ordinaryOrigin]=await Promise.all([listen(scoServer),listen(ordinaryServer)]);

    const deniedSco=await fetch(scoOrigin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:selected.methodNames[METHOD],args:[7]})
    });
    const deniedOrdinary=await fetch(ordinaryOrigin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:selected.methodNames[METHOD],args:[7]})
    });
    assert.equal(deniedSco.status,403);
    assert.equal(deniedOrdinary.status,403);

    const published=await fetch(scoOrigin+'/obfs/triangular.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(published.status,200);
    const delivered=await published.text();
    assert.equal(delivered,publicCode);
    const routeMatch=delivered.match(
      /export async function protectedTriangular\\([^)]*\\)\\{return await [\\w$]+\\("([^"]+)",\\[\\.\\.\\.arguments\\]\\);\\}/u);
    const publicMethod=routeMatch?.[1];
    assert.ok(publicMethod,'Published private method route was not recoverable');
    assert.equal(publicMethod,selected.methodNames[METHOD]);

    const [scoClone,ordinaryClone]=await Promise.all([
      cloneAuthorizedQuadratic({origin:scoOrigin,method:publicMethod,credential:TOKEN}),
      cloneAuthorizedQuadratic({origin:ordinaryOrigin,method:publicMethod,credential:TOKEN})
    ]);
    assert.equal(scoClone.queryCount,529);
    assert.equal(ordinaryClone.queryCount,529);
    assert.equal(scoCounters.executions,529);
    assert.equal(ordinaryCounters.executions,529);
    assert.equal(scoClone.transcriptSha256,ordinaryClone.transcriptSha256,
      'same-trust ordinary service exposed different oracle behavior');

    if(!scoServer||!ordinaryServer)throw new Error('both oracle servers must be listening before shutdown');
    await Promise.all([close(scoServer),close(ordinaryServer)]);
    scoServer=undefined;
    ordinaryServer=undefined;

    const evaluator=makeQuadraticModelEvaluator(scoClone.model);
    const ordinaryEvaluator=makeQuadraticModelEvaluator(ordinaryClone.model);
    const clone=evaluator.clone;
    const ordinaryEvaluate=ordinaryEvaluator.clone;
    const inverter=prepareExactQuadraticInverter(clone,evaluator.polar);
    const radical=polarRadicalDimensions(clone,evaluator.polar);
    const verify=fixture.secret;
    let holdoutMatches=0;
    for(let i=0;i<holdouts;i++){
      const input=verify();
      const expected=(await oracle(input))>>>0;
      if(clone(input)===expected&&ordinaryEvaluate(input)===expected)holdoutMatches++;
    }
    assert.equal(holdoutMatches,holdouts);
    let exactInversions=0;
    for(let i=0;i<targets;i++){
      const secret=verify();
      const target=(await oracle(secret))>>>0;
      if(inverter.invert(target)===secret)exactInversions++;
    }
    assert.equal(exactInversions,targets);
    assert.equal(scoCounters.executions,529,'SCO server was contacted after fitting');
    assert.equal(ordinaryCounters.executions,529,'ordinary server was contacted after fitting');
    return{
      scoQueries:scoClone.queryCount,
      ordinaryQueries:ordinaryClone.queryCount,
      scoPrivateExecutions:scoCounters.executions,
      ordinaryPrivateExecutions:ordinaryCounters.executions,
      deniedScoStatus:deniedSco.status,
      deniedOrdinaryStatus:deniedOrdinary.status,
      transcriptMatched:scoClone.transcriptSha256===ordinaryClone.transcriptSha256,
      holdouts,holdoutMatches,targets,exactInversions,
      offlineDefectEvaluations:inverter.offlineDefectEvaluations,
      radicalDimension:radical.dimension,radicalCodimension:radical.codimension,
      offlineAfterBothServersClosed:true,
      publicPrivateMarkerLeaked:privateMarker.test(publicCode),
      transcriptSha256:scoClone.transcriptSha256,
      privateSourceSha256:createHash('sha256').update(source).digest('hex')
    };
  }finally{
    if(scoServer)await close(scoServer);
    if(ordinaryServer)await close(ordinaryServer);
  }
}

if(require.main===module){
  runChallenge().then(result=>process.stdout.write(`${JSON.stringify(result,null,2)}\n`))
    .catch(error=>{process.stderr.write(`${error.stack||error}\n`);process.exitCode=1;});
}

module.exports={runChallenge,createOrdinaryOracleServer};
