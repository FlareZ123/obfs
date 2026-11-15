'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {randomInt,randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

const MAX=(2**20)-1;

/** @typedef {{score:(x:number)=>Promise<number>}} OracleApi */
/** @typedef {{leftSlope:number,leftOffset:number,rightSlope:number,rightOffset:number,threshold:number}} PiecewiseModel */

/** @param {PiecewiseModel} model @param {number} x @returns {number} */
function predict(model,x) {
  return x<=model.threshold
    ? model.leftSlope*x+model.leftOffset
    : model.rightSlope*x+model.rightOffset;
}

/**
 * Chosen-input attacker with only the public SCO async score proxy.
 * Prior hypothesis: two integer affine branches, nonintersecting outputs,
 * one unknown interior threshold, within known input domain 0..MAX.
 * No filesystem, code extraction, or original constants are consulted.
 *
 * @param {OracleApi} api
 * @returns {Promise<{model:PiecewiseModel,probes:number[],elapsedMs:number}>}
 */
async function recoverPiecewise(api) {
  const started=performance.now();
  /** @type {number[]} */
  const probes=[];
  /** @param {number} x @returns {Promise<number>} */
  async function ask(x) {
    probes.push(x);
    const y=await api.score(x);
    assert.ok(Number.isSafeInteger(y),'Unexpected noninteger oracle result');
    return y;
  }
  const low0=await ask(0);
  const low1=await ask(1);
  const high0=await ask(MAX-1);
  const high1=await ask(MAX);
  const leftSlope=low1-low0;
  const rightSlope=high1-high0;
  const leftOffset=low0;
  const rightOffset=high1-rightSlope*MAX;
  /** @param {number} x @returns {number} */
  const left=x=>leftSlope*x+leftOffset;
  /** @param {number} x @returns {number} */
  const right=x=>rightSlope*x+rightOffset;

  // The experiment guarantees that the right branch never equals the left
  // branch over the valid domain, so mismatch from the left is monotonic.
  let low=2,high=MAX-1;
  while(low<high) {
    const midpoint=Math.floor((low+high)/2);
    if(await ask(midpoint)===left(midpoint))low=midpoint+1;
    else high=midpoint;
  }
  const threshold=low-1;
  assert.equal(await ask(threshold),left(threshold));
  assert.equal(await ask(threshold+1),right(threshold+1));
  return {
    model:{leftSlope,leftOffset,rightSlope,rightOffset,threshold},
    probes,elapsedMs:Number((performance.now()-started).toFixed(3))
  };
}

/**
 * Keep a two-branch function on a trusted SCO server and attack only its
 * publicly authorized RPC facade, then evaluate on withheld inputs.
 * @param {number} index
 * @returns {Promise<{index:number,sourceDisclosed:boolean,unauthorizedStatus:number,
 *   authorizedQueries:number,heldout:number,exact:boolean,elapsedMs:number,
 *   privateSha256:string,recovered:PiecewiseModel,actual:PiecewiseModel}>}
 */
async function scenario(index) {
  const actual={
    leftSlope:randomInt(2,8),
    leftOffset:randomInt(0,1000),
    rightSlope:randomInt(9,16),
    rightOffset:randomInt(17_000_000,19_000_000),
    threshold:randomInt(4096,MAX-4096)
  };
  const privateCanary='hidden-piecewise-'+randomBytes(12).toString('hex');
  const original=[
    'const params='+JSON.stringify(actual)+';',
    'const privateCanary='+JSON.stringify(privateCanary)+';',
    'export async function score(x){',
    'if(!Number.isSafeInteger(x)||x<0||x>'+MAX+')throw TypeError("domain");',
    'return x<=params.threshold?params.leftSlope*x+params.leftOffset:',
    'params.rightSlope*x+params.rightOffset;',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule(
    {path:'client.mjs',sourceType:'module',code:original},{
      seed:randomBytes(16).toString('hex'),
      serverOnlyInitialization:true
    }
  );
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-piecewise-'));
  /** @type {import('node:http').Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try {
    const privatePath=path.join(directory,'private','original.mjs');
    await atomicWrite(privatePath,original);
    const privateModule=await import(pathToFileURL(privatePath).href);
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,privateModule),
      authorizeRpc:request=>request.headers.cookie==='session=allow',
      authorizeOperation:(request,method,args)=>
        request.headers.cookie==='session=allow' &&
        method===partition.methodNames.score &&
        args.length===1&&Number.isSafeInteger(args[0])&&
        args[0]>=0&&args[0]<=MAX
    }));
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const publicResponse=await nativeFetch(origin+'/obfs/client.mjs');
    assert.equal(publicResponse.status,200);
    const publicSource=await publicResponse.text();
    assert.equal(publicSource.includes(privateCanary),false);
    assert.equal(publicSource.includes('rightOffset'),false);
    const clientPath=path.join(directory,'public','client.mjs');
    await atomicWrite(clientPath,publicSource);

    const unauthorized=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.score,args:[0]})
    });
    assert.equal(unauthorized.status,403);
    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),origin),{
      ...options,headers:{...options?.headers,cookie:'session=allow'}
    });
    const api=/** @type {OracleApi} */(await import(pathToFileURL(clientPath).href));
    const attack=await recoverPiecewise(api);
    assert.deepEqual(attack.model,actual);
    const observed=new Set(attack.probes);
    /** @type {number[]} */
    const heldout=[];
    for(let i=0;i<256;i++) {
      const x=(i*7919+121)%MAX;
      if(!observed.has(x))heldout.push(x);
    }
    for(const x of heldout) {
      const truth=await privateModule.score(x);
      assert.equal(predict(attack.model,x),truth);
    }
    return {
      index,sourceDisclosed:false,unauthorizedStatus:unauthorized.status,
      authorizedQueries:attack.probes.length,
      heldout:heldout.length,exact:true,elapsedMs:attack.elapsedMs,
      privateSha256:createHash('sha256').update(original).digest('hex'),
      recovered:attack.model,actual
    };
  }finally{
    globalThis.fetch=nativeFetch;
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {number} [count]
 * @returns {Promise<{scenarios:number,queries:number,heldout:number,allExact:boolean,details:Awaited<ReturnType<typeof scenario>>[]}>}
 */
async function runPiecewise(count=8) {
  if(!Number.isSafeInteger(count)||count<1||count>20)throw new RangeError('count 1..20');
  /** @type {Awaited<ReturnType<typeof scenario>>[]} */
  const details=[];
  for(let i=0;i<count;i++)details.push(await scenario(i));
  return {
    scenarios:details.length,
    queries:details.reduce((sum,item)=>sum+item.authorizedQueries,0),
    heldout:details.reduce((sum,item)=>sum+item.heldout,0),
    allExact:details.every(item=>item.exact),
    details
  };
}

if(require.main===module) {
  runPiecewise().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={MAX,predict,recoverPiecewise,scenario,runPiecewise};
