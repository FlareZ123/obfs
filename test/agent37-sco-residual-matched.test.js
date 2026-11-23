'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const esbuild=require('esbuild');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {masksOfWeight,learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {invertBoundedDegree}=
  require('../sims/two-sided-affine-degree-inversion');

const TOKEN='authorized-residual-sbox-study';
const BASE_SBOX=[0,1,2,4,3,6,7,5];

/**
 * Randomize the retained nonlinear S-box by independent input/output XOR
 * translations. Translation preserves its max degree two and absence of a
 * nonconstant affine output parity. The random table stays server-side.
 * @returns {{source:string,sourceSha256:string,inputOffset:number,outputOffset:number}}
 */
function makePrivateSource(){
  const offsets=randomBytes(2);
  const inputOffset=offsets[0]&7,outputOffset=offsets[1]&7;
  const table=Array.from({length:8},(_,input)=>
    BASE_SBOX[input^inputOffset]^outputOffset);
  const source=[
    'export async function protectedResidual(input){',
    'const OBFS_PRIVATE_SBOX='+JSON.stringify(table)+';',
    'const x=input>>>0;',
    'return ((x&65528)|OBFS_PRIVATE_SBOX[x&7])>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
  return {source,sourceSha256:createHash('sha256').update(source).digest('hex'),
    inputOffset,outputOffset};
}

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


/**
 * Family-aware authorized learner: the public research grammar fixes the
 * eight base entries; the server-private input/output XOR offsets are unknown.
 * The transcript at inputs 0,1,2 distinguishes all 64 translated tables.
 * @param {string} origin
 * @param {string} method
 * @returns {Promise<{inputOffset:number,outputOffset:number,queryCount:number}>}
 */
async function learnTranslatedFamily(origin,method){
  /** @type {number[]} */
  const values=[];
  for(const input of [0,1,2]){
    const response=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{
        'content-type':'application/json','x-demo-session':TOKEN
      },
      body:JSON.stringify({method,args:[input]})
    });
    assert.equal(response.status,200);
    /** @type {{ok?:unknown,value?:unknown}} */
    const reply=await response.json();
    assert.equal(reply.ok,true);
    assert.ok(typeof reply.value==='number'&&
      Number.isInteger(reply.value)&&reply.value>=0&&reply.value<8);
    values.push(reply.value);
  }
  /** @type {Array<{inputOffset:number,outputOffset:number}>} */
  const candidates=[];
  for(let inputOffset=0;inputOffset<8;inputOffset++){
    for(let outputOffset=0;outputOffset<8;outputOffset++){
      if([0,1,2].every((input,index)=>
        (BASE_SBOX[input^inputOffset]^outputOffset)===values[index])){
        candidates.push({inputOffset,outputOffset});
      }
    }
  }
  assert.equal(candidates.length,1,
    'Three source-family observations must identify a unique translation');
  return {...candidates[0],queryCount:3};
}

/**
 * Offline inversion after family-aware learning, with no private requests.
 * @param {number} target
 * @param {{inputOffset:number,outputOffset:number}} model
 * @returns {number|null}
 */
function invertTranslatedFamily(target,model){
  const low=target&7;
  for(let input=0;input<8;input++){
    if((BASE_SBOX[input^model.inputOffset]^model.outputOffset)===low){
      return ((target&65528)|input)>>>0;
    }
  }
  return null;
}

test('live SCO and equal-trust ordinary minified APIs admit the same residual offline inversion',async()=>{
  const {source,sourceSha256,inputOffset,outputOffset}=makePrivateSource();
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
    const scoFamily=await learnTranslatedFamily(scoOrigin,route[1]);
    const ordinaryFamily=await learnTranslatedFamily(
      plainOrigin,'protectedResidual');
    assert.deepEqual(scoFamily,ordinaryFamily);
    assert.deepEqual(scoFamily,{inputOffset,outputOffset,queryCount:3});
    assert.equal(scoCalls,140);
    assert.equal(ordinaryCalls,140);

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
      assert.equal(invertTranslatedFamily(target,scoFamily),hidden);
      assert.equal(invertTranslatedFamily(target,ordinaryFamily),hidden);
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
    assert.equal(scoCalls,140);
    assert.equal(ordinaryCalls,140);
    process.stdout.write('OBFS_SCO_RESIDUAL_MATCHED '+JSON.stringify({
      sourceSha256,inputOffset,outputOffset,
      genericQueriesPerService:137,familyAwareQueriesPerService:3,
      authorizedRequestsPerService:140,heldoutTargets:hiddenInputs.length,
      recoveredPerService:hiddenInputs.length,familyRecoveredPerService:5,
      withFallback,
      scoPrivateExecutions:scoCalls,ordinaryPrivateExecutions:ordinaryCalls,
      bothDeniedUnauthorized:true,bothStoppedBeforeInverse:true
    })+'\n');
  }finally{
    if(scoLive)await close(scoServer);
    if(plainLive)await close(plainServer);
  }
});

test('three chosen outputs identify all translated S-boxes, while two cannot',()=>{
  const family=[];
  for(let inputOffset=0;inputOffset<8;inputOffset++){
    for(let outputOffset=0;outputOffset<8;outputOffset++){
      family.push({inputOffset,outputOffset});
    }
  }
  /** @param {{inputOffset:number,outputOffset:number}} model
   * @param {number} input @returns {number} */
  const evaluate=(model,input)=>
    BASE_SBOX[input^model.inputOffset]^model.outputOffset;
  assert.equal(family.length,64);
  const triples=new Set(family.map(model=>
    [0,1,2].map(input=>evaluate(model,input)).join(',')));
  assert.equal(triples.size,64,
    'The fixed three-query transcript identifies every translation');

  // After ANY first chosen input/output, exactly eight possible offset
  // pairs remain. For EVERY possible second chosen input, their outputs
  // collide, so adapting the second query to the first cannot guarantee
  // identification in two queries.
  for(let first=0;first<8;first++){
    for(let firstOutput=0;firstOutput<8;firstOutput++){
      const possible=family.filter(model=>
        evaluate(model,first)===firstOutput);
      assert.equal(possible.length,8);
      for(let second=0;second<8;second++){
        const next=new Set(possible.map(model=>evaluate(model,second)));
        assert.ok(next.size<8,'Two observations cannot separate all candidates');
      }
    }
  }
});
