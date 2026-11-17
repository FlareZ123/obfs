'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {transform,version:esbuildVersion}=require('esbuild');
const {createScoRpcClientSource}=require('../src');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeServer}=require('./sco-ratchet-batch-candidate');

/** @typedef {{status:number,body:{ok?:boolean,value?:string[]}}} RpcResponse */
/** @typedef {{publicSha256:string,outputs:string[]}} AttackResult */
/** @typedef {{client:'generated'|'minified',nativeMs:number,remoteMs:number,ratio:number}} TimedPair */

/**
 * A same-trust ordinary ESM facade, deliberately using the exact endpoint,
 * HTTP method, fetch options, JSON shape, returned value and error contract
 * used by the generator. Esbuild minifies this public adapter only.
 */
const ordinarySource=[
  "async function batch(...args){",
  "  const response=await fetch('/obfs/rpc',{",
  "    method:'POST',credentials:'same-origin',cache:'no-store',",
  "    headers:{'content-type':'application/json'},",
  "    body:JSON.stringify({method:'batch',args})",
  "  });",
  "  const payload=await response.json();",
  "  if(!response.ok||!payload||payload.ok!==true)",
  "    throw Error('Remote operation failed');",
  "  return payload.value;",
  "}",
  "const methods=Object.create(null);",
  "Object.defineProperty(methods,'batch',{enumerable:true,value:batch});",
  "export default Object.freeze(methods);"
].join('\n');

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/** @param {Buffer|string} bytes @returns {string} */
function digest(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const ordered=[...numbers].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,base:string}>}
 */
async function listen(handler){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,base:'http://127.0.0.1:'+address.port};
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const closed=new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await closed;
}

/**
 * External independent public-client adversary. Identical process/script
 * operates against both cases, receiving only origin and Account A token.
 * @param {string} base
 * @param {string} token
 * @returns {Promise<{result:AttackResult,elapsedMs:number}>}
 */
async function attack(base,token){
  const started=performance.now();
  const child=await promisify(execFile)(process.execPath,[
    require.resolve('./sco-ratchet-batch-public-attacker'),base,token
  ],{timeout:120000,maxBuffer:1024*1024});
  const result=/** @type {AttackResult} */(JSON.parse(child.stdout));
  return {result,elapsedMs:performance.now()-started};
}

/**
 * Direct verifier, including an unauthenticated and cross-account control.
 * The actual adversary above uses the published facade instead.
 * @param {typeof fetch} nativeFetch
 * @param {string} base
 * @param {string|undefined} token
 * @param {number} seq
 * @param {string[]} inputs
 * @param {unknown[]} [args]
 * @returns {Promise<RpcResponse>}
 */
async function rpc(nativeFetch,base,token,seq,inputs,args){
  const response=await nativeFetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(token?{cookie:'session='+token}:{})
    },
    body:JSON.stringify({method:'batch',args:args??[seq,inputs]})
  });
  return {status:response.status,body:/** @type {RpcResponse['body']} */(await response.json())};
}

/** @param {string} code @returns {Promise<{batch:(...args:unknown[])=>Promise<string[]>}>} */
async function loadFacade(code){
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const module=/** @type {{default:{batch:(...args:unknown[])=>Promise<string[]>}}} */(await import(url));
  return module.default;
}

/**
 * One matched 16-event workload at each delay setting. Both published
 * facades invoke independent state machines initialized with the same key.
 * @param {Buffer} key
 * @param {number} delayMs
 * @returns {Promise<object>}
 */
async function profile(key,delayMs){
  const generated=createScoRpcClientSource(['batch']);
  const minified=(await transform(ordinarySource,{
    loader:'js',format:'esm',target:'es2022',minify:true,legalComments:'none'
  })).code;
  assert.notEqual(generated,minified);
  const staticWireShapes=[generated,minified].map(code=>{
    assert.doesNotMatch(code,/createPrivateMachine|ratchet-step-v1|createHmac/u);
    assert.doesNotMatch(code,new RegExp(key.toString('hex'),'u'));
    // This bounded static read needs only the delivered source bytes.
    // Both facades expose the same endpoint, method, and HTTP verb.
    return {
      endpoint:code.includes('/obfs/rpc'),
      method:/['"]batch['"]/u.test(code),
      verb:/['"]POST['"]/u.test(code)
    };
  });
  assert.deepEqual(staticWireShapes,[
    {endpoint:true,method:true,verb:true},
    {endpoint:true,method:true,verb:true}
  ]);
  const candidate=makeServer(key,delayMs,generated);
  const control=makeServer(key,delayMs,minified);
  const a=await listen(candidate.handler);
  const b=await listen(control.handler);
  const nativeFetch=globalThis.fetch;
  let currentBase='';
  let currentToken='';
  try{
    const tokenA=randomBytes(32).toString('hex');
    const tokenB=randomBytes(32).toString('hex');
    candidate.grant(tokenA,'A');
    control.grant(tokenA,'A');
    candidate.grant(tokenB,'B');
    control.grant(tokenB,'B');
    const sources=await Promise.all([a.base,b.base].map(base=>
      nativeFetch(base+'/obfs/batch.mjs',{headers:{cookie:'session='+tokenA}})));
    assert.deepEqual(sources.map(response=>response.status),[200,200]);
    const published=await Promise.all(sources.map(response=>response.text()));
    assert.deepEqual(published,[generated,minified]);
    const inputs=Array.from({length:32},(_,index)=>challenge(index));
    for(const base of [a.base,b.base]){
      assert.equal((await nativeFetch(base+'/obfs/batch.mjs')).status,403);
      assert.equal((await rpc(nativeFetch,base,undefined,0,inputs)).status,403);
      assert.equal((await rpc(nativeFetch,base,tokenA,0,inputs,[0,inputs,'B'])).status,403);
    }
    const independent=await Promise.all([
      attack(a.base,tokenA),attack(b.base,tokenA)
    ]);
    const original=createPrivateMachine(key);
    const nativeA=inputs.map((value,index)=>original.advance('A',index,value));
    const nativeB=inputs.map((value,index)=>original.advance('B',index,value));
    assert.deepEqual(independent[0].result.outputs,nativeA);
    assert.deepEqual(independent[1].result.outputs,nativeA);
    assert.equal(independent[0].result.publicSha256,digest(generated));
    assert.equal(independent[1].result.publicSha256,digest(minified));
    const targets=await Promise.all([
      rpc(nativeFetch,a.base,tokenB,0,inputs),
      rpc(nativeFetch,b.base,tokenB,0,inputs)
    ]);
    for(const target of targets){
      assert.equal(target.status,200);
      assert.deepEqual(target.body.value,nativeB);
    }
    const crossAccountMatches=nativeA.filter((value,index)=>value===nativeB[index]).length;
    assert.equal(crossAccountMatches,0);

    const facades=await Promise.all([loadFacade(generated),loadFacade(minified)]);
    // Both actual ESM facades call the same-origin absolute RPC path. Route the
    // Node test fetch to the currently measured server, carrying its A cookie.
    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),currentBase),{
      ...options,headers:{...options?.headers,cookie:'session='+currentToken}
    });
    /** @type {TimedPair[]} */
    const pairs=[];
    for(let trial=0;trial<7;trial++){
      const principal='equal-trust/'+delayMs+'/'+trial;
      const native=createPrivateMachine(key);
      const sample=Array.from({length:16},(_,index)=>challenge(index));
      const token=randomBytes(32).toString('hex');
      candidate.grant(token,principal);
      control.grant(token,principal);
      const start=performance.now();
      const expected=sample.map((value,index)=>native.advance(principal,index,value));
      const nativeMs=performance.now()-start;
      const order=trial%2===0?/** @type {const} */([0,1]):
        /** @type {const} */([1,0]);
      for(const index of order){
        currentBase=index===0?a.base:b.base;
        currentToken=token;
        const began=performance.now();
        const received=await facades[index].batch(0,sample);
        const remoteMs=performance.now()-began;
        assert.deepEqual(received,expected);
        pairs.push({
          client:index===0?'generated':'minified',nativeMs,remoteMs,ratio:remoteMs/nativeMs
        });
      }
    }
    const summarize=/** @param {'generated'|'minified'} name */name=>{
      const rows=pairs.filter(pair=>pair.client===name);
      return {
        name,trials:rows.length,
        medianRatio:median(rows.map(row=>row.ratio)),
        maximumRatio:Math.max(...rows.map(row=>row.ratio)),
        strictOverBudgetPairs:rows.filter(row=>row.ratio>2.5).length,
        ratios:rows.map(row=>Number(row.ratio.toFixed(5))),
        rawPairs:rows.map(row=>({
          nativeMs:Number(row.nativeMs.toFixed(5)),
          remoteMs:Number(row.remoteMs.toFixed(5))
        }))
      };
    };
    const budgets=[summarize('generated'),summarize('minified')];
    assert.equal(budgets[0].strictOverBudgetPairs,0,
      'Generated facade exceeds 2.5x in declared 16-event sample');
    assert.equal(budgets[1].strictOverBudgetPairs,0,
      'Minified same-trust control exceeds 2.5x in declared 16-event sample');
    return {
      delayMs,platform:process.platform,node:process.version,esbuild:esbuildVersion,
      generatedSha256:digest(generated),minifiedSha256:digest(minified),
      staticWireShapes,
      generatedBytes:Buffer.byteLength(generated),minifiedBytes:Buffer.byteLength(minified),
      independentAOnlineClones:[independent[0].result.outputs.length,
        independent[1].result.outputs.length],
      independentChildElapsedMs:independent.map(item=>Number(item.elapsedMs.toFixed(5))),
      crossAccountMatches,unauthorizedStatuses:[403,403],
      stolenBTokenCounterfactualSuccess:true,budgets,
      caveat:'Equal-trust servers, identical key/operation. Child process fetch/import are separate cold observations. Localhost delay is synthetic.'
    };
  }finally{
    globalThis.fetch=nativeFetch;
    await Promise.all([close(a.server),close(b.server)]);
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const root=randomBytes(32);
  return {
    candidate:'SCO generated facade versus equal-trust esbuild-minified RPC facade',
    scenarios:[await profile(root,0),await profile(root,25)],
    verdict:'Both have same server-side key, policy and A-only online attacker capability. Neither facade prevents authorized online cloning.'
  };
}

if(require.main===module){
  experiment().then(result=>process.stdout.write(
    'SCO_EQUAL_TRUST_CONTROL_RESULT '+JSON.stringify(result)+'\n'),
  error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment};
