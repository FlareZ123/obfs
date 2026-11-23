'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const esbuild=require('esbuild');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {masksOfWeight,learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {invertBoundedDegree}=
  require('../sims/two-sided-affine-degree-inversion');

const TOKEN='authorized-residual-sbox-study';
const source=[
  'export async function protectedResidual(input){',
  'const OBFS_PRIVATE_SBOX=[0,1,2,4,3,6,7,5];',
  'const x=input>>>0;',
  'return ((x&65528)|OBFS_PRIVATE_SBOX[x&7])>>>0;',
  '}',
  'export function publicIdentity(value){return value>>>0;}'
].join('\n');

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function start(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
}

/**
 * An ordinary minified private function behind the same bearer header.
 * @param {(value:number)=>Promise<number>} functionBody
 * @param {()=>void} count
 * @returns {import('node:http').RequestListener}
 */
function ordinaryHandler(functionBody,count){
  return async(request,response)=>{
    /** @param {number} status @param {Record<string,unknown>} payload */
    function reply(status,payload){
      response.writeHead(status,{'content-type':'application/json'});
      response.end(JSON.stringify(payload));
    }
    if(request.method!=='POST'||request.url!=='/obfs/rpc'){
      reply(404,{ok:false});return;
    }
    if(request.headers['x-demo-session']!==TOKEN){
      reply(403,{ok:false});return;
    }
    let raw='';
    try{
      for await(const chunk of request)raw+=String(chunk);
      /** @type {{method?:unknown,args?:unknown}} */
      const query=JSON.parse(raw);
      if(query.method!=='protectedResidual'||!Array.isArray(query.args)||
         query.args.length!==1||!Number.isSafeInteger(query.args[0])||
         query.args[0]<0||query.args[0]>=65536){
        reply(400,{ok:false});return;
      }
      count();
      reply(200,{ok:true,value:await functionBody(
        /** @type {number} */(query.args[0]))});
    }catch(error){reply(500,{ok:false});}
  };
}

/**
 * Learn the complete degree-two polynomial only through legitimate HTTP
 * responses. The attacker receives a public method name and the same
 * credential for both equal-trust services.
 * @param {string} origin
 * @param {string} method
 * @returns {Promise<ReturnType<typeof learnBoundedDegreeOracle>>}
 */
async function learn(origin,method){
  /** @type {Map<number,number>} */
  const replies=new Map();
  for(let weight=0;weight<=2;weight++){
    for(const input of masksOfWeight(16,weight)){
      const response=await fetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':TOKEN},
        body:JSON.stringify({method,args:[input]})
      });
      assert.equal(response.status,200);
      /** @type {{ok?:unknown,value?:unknown}} */
      const body=await response.json();
      assert.equal(body.ok,true);
      assert.ok(typeof body.value==='number'&&Number.isSafeInteger(body.value)&&
        body.value>=0&&body.value<65536);
      replies.set(input,body.value);
    }
  }
  assert.equal(replies.size,137);
  const model=learnBoundedDegreeOracle(input=>{
    const output=replies.get(input);
    assert.notEqual(output,undefined);
    return /** @type {number} */(output);
  },16,2);
  assert.equal(model.queryCount,137);
  return model;
}

test('live SCO and equal-trust ordinary minified APIs admit the same residual offline inversion',async()=>{
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const ordinary=await import('data:text/javascript,'+encodeURIComponent(
    esbuild.transformSync(source,{
      loader:'js',format:'esm',target:'es2022',minify:true
    }).code));
  const selected=partitionScoSelectedAsyncExports({
    path:'residual.mjs',sourceType:'module',code:source
  },{seed:'agent37-residual-matched-study',
    privateNames:['protectedResidual']});
  const publicCode=selected.clientFile.code;
  assert.doesNotMatch(publicCode,/OBFS_PRIVATE_SBOX|65528/u);
  let scoCalls=0,ordinaryCalls=0;
  const wrapped=bindScoModuleExports(selected,original);
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const methods=Object.create(null);
  for(const [name,fn] of Object.entries(wrapped)){
    methods[name]=(...args)=>{scoCalls++;return fn(...args);};
  }

  const scoServer=http.createServer(createScoHandler([selected.clientFile],{
    remoteMethods:methods,
    authorizeRead:request=>request.headers['x-demo-session']===TOKEN,
    authorizeRpc:request=>request.headers['x-demo-session']===TOKEN,
    authorizeOperation:(request,method,args)=>
      request.headers['x-demo-session']===TOKEN&&
      method===selected.methodNames.protectedResidual&&
      args.length===1&&Number.isSafeInteger(args[0])&&
      /** @type {number} */(args[0])>=0&&
      /** @type {number} */(args[0])<65536
  }));
  const plainServer=http.createServer(ordinaryHandler(
    ordinary.protectedResidual,()=>ordinaryCalls++));
  let scoLive=false,plainLive=false;
  try{
    const scoOrigin=await start(scoServer);scoLive=true;
    const plainOrigin=await start(plainServer);plainLive=true;

    for(const origin of [scoOrigin,plainOrigin]){
      const denied=await fetch(origin+'/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({method:'protectedResidual',args:[7]})
      });
      assert.equal(denied.status,403);
    }
    const deniedRead=await fetch(scoOrigin+'/obfs/residual.mjs');
    assert.equal(deniedRead.status,403,
      'An unauthenticated client must not fetch even the SCO public facade');
    const publicResponse=await fetch(scoOrigin+'/obfs/residual.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(publicResponse.status,200);
    const distributed=await publicResponse.text();
    assert.equal(distributed,publicCode);
    const route=distributed.match(
      /export async function protectedResidual\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
    );
    assert.ok(route?.[1]);

    const scoModel=await learn(scoOrigin,route[1]);
    const ordinaryModel=await learn(plainOrigin,'protectedResidual');
    assert.equal(scoCalls,137);
    assert.equal(ordinaryCalls,137);
    assert.deepEqual(scoModel.coefficients,ordinaryModel.coefficients);

    await close(scoServer);scoLive=false;
    await close(plainServer);plainLive=false;
    const hiddenInputs=[0x9157,0x1234,0xffff,0x0007,0x8005];
    let withFallback=0;
    for(const hidden of hiddenInputs){
      // Target is selected by the verifier, never included in the learning
      // transcript. No more HTTP requests occur after both servers close.
      const target=await original.protectedResidual(hidden);
      assert.equal(await ordinary.protectedResidual(hidden),target,
        'The equal-trust minified backend must match on held-out inputs');
      for(const model of [scoModel,ordinaryModel]){
        /** @param {number} input @returns {number} */
        const offline=input=>evaluateBoundedDegreeModel(model,input);
        const candidate=invertBoundedDegree(offline,target,16,2,5000,
          {maxResidualDimension:3});
        assert.equal(candidate?.input,hidden);
        if(candidate?.exactResidualDimension===3)withFallback++;
      }
    }
    assert.ok(withFallback>=2);
    assert.equal(scoCalls,137);
    assert.equal(ordinaryCalls,137);
    process.stdout.write('OBFS_SCO_RESIDUAL_MATCHED '+JSON.stringify({
      authorizedRequestsPerService:137,heldoutTargets:hiddenInputs.length,
      recoveredPerService:hiddenInputs.length,withFallback,
      scoPrivateExecutions:scoCalls,ordinaryPrivateExecutions:ordinaryCalls,
      bothDeniedUnauthorized:true,bothStoppedBeforeInverse:true
    })+'\n');
  }finally{
    if(scoLive)await close(scoServer);
    if(plainLive)await close(plainServer);
  }
});
