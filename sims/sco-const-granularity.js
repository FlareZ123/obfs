'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {performance}=require('node:perf_hooks');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

/**
 * Median of a nonempty finite set of measured runtimes.
 * @param {number[]} samples
 * @returns {number}
 */
function median(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Compare the actual served async expression RPC stub against the original
 * server-resident function. Setup, local network and sampled application
 * compute are reported separately. All RPC requests remain authenticated.
 *
 * @returns {Promise<{
 *   mode:string,node:string,platform:string,servedSourceBytes:number,
 *   privateSourceBytes:number,privateCanaryLeaked:boolean,
 *   samples:{iterations:number,nativeMedianMs:number,rpcMedianMs:number,
 *     runtimeRatio:number,withinBudget:boolean}[]
 * }>}
 */
async function measureScoConstGranularity() {
  const secret='SCO_SERVER_ONLY_CANARY_314159';
  // Build a byte-identical ESM fixture on Windows and Linux. Function#toString
  // would inherit checkout-specific line endings from this benchmark script.
  const source=[
    'export const compute=async value=>{',
    'const privateCanary='+JSON.stringify(secret)+';',
    'function internalDigest(input){',
    ' let x=123456789;',
    ' for(let i=0;i<input;i++)x=(Math.imul(x^i,1664525)+1013904223)|0;',
    ' return x>>>0;',
    '}',
    'return internalDigest(value);',
    '};'
  ].join('\n');
  const partition=partitionScoAsyncModule({path:'kernel.mjs',sourceType:'module',code:source},{
    seed:'sco-const-granularity'
  });
  const actual=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(partition,actual);
  const server=http.createServer(createScoHandler([partition.clientFile],{
    authorizeRead:req=>req.headers.cookie==='session=allow',
    authorizeRpc:req=>req.headers.cookie==='session=allow',
    authorizeOperation:(req,method,args)=>
      req.headers.cookie==='session=allow'&&method===partition.methodNames.compute &&
      args.length===1&&Number.isSafeInteger(args[0])&&args[0]>=0&&args[0]<=10000000,
    remoteMethods:methods
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP listener');
  const origin='http://127.0.0.1:'+address.port;
  const originalFetch=globalThis.fetch;
  try {
    const denied=await originalFetch(origin+'/obfs/kernel.mjs');
    assert.equal(denied.status,403);
    const delivered=await originalFetch(origin+'/obfs/kernel.mjs',{
      headers:{cookie:'session=allow'}
    });
    assert.equal(delivered.status,200);
    const served=await delivered.text();
    assert.equal(served.includes(secret),false,'Private source literal was published');
    globalThis.fetch=(route,options)=>originalFetch(new URL(String(route),origin),{
      ...options,headers:{...options?.headers,cookie:'session=allow'}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(served));
    /** @type {{iterations:number,nativeMedianMs:number,rpcMedianMs:number,
     *  runtimeRatio:number,withinBudget:boolean}[]} */
    const samples=[];
    for(const count of [1,6_000_000]) {
      assert.equal(await client.compute(count),await actual.compute(count));
      for(let i=0;i<6;i++) {
        await client.compute(count);
        await actual.compute(count);
      }
      /** @type {number[]} */
      const nativeTimes=[];
      /** @type {number[]} */
      const rpcTimes=[];
      for(let i=0;i<12;i++) {
        /** @param {()=>Promise<number>} operation @returns {Promise<number>} */
        async function time(operation) {
          const start=performance.now();
          await operation();
          return performance.now()-start;
        }
        if(i%2===0) {
          nativeTimes.push(await time(()=>actual.compute(count)));
          rpcTimes.push(await time(()=>client.compute(count)));
        } else {
          rpcTimes.push(await time(()=>client.compute(count)));
          nativeTimes.push(await time(()=>actual.compute(count)));
        }
      }
      const nativeMedianMs=median(nativeTimes),rpcMedianMs=median(rpcTimes);
      samples.push({
        iterations:count,
        nativeMedianMs:Number(nativeMedianMs.toFixed(6)),
        rpcMedianMs:Number(rpcMedianMs.toFixed(6)),
        runtimeRatio:Number((rpcMedianMs/nativeMedianMs).toFixed(6)),
        withinBudget:rpcMedianMs/nativeMedianMs<=2.5
      });
    }
    return {
      mode:'SCO private async const expression, authenticated loopback JSON RPC',
      node:process.version,platform:process.platform,
      servedSourceBytes:Buffer.byteLength(served),
      privateSourceBytes:Buffer.byteLength(source),
      privateCanaryLeaked:served.includes(secret),
      samples
    };
  }finally{
    globalThis.fetch=originalFetch;
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module) {
  measureScoConstGranularity().then(value=>process.stdout.write(JSON.stringify(value,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={measureScoConstGranularity};
