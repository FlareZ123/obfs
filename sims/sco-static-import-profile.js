'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-static-imports');
const SEED='sco-static-import-20261116';

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Measure warm end-to-end local HTTP RPC against the *same* original
 * server-resident crypto operation, including authentication and JSON.
 * This profile excludes cold module load, TLS, network RTT, cross-host latency,
 * and a potential attacker-operated relay. It measures only this workload.
 * @returns {Promise<{
 *   node:string,platform:string,privateBytes:number,clientBytes:number,
 *   rounds:number,unauthorizedStatus:number,nativeMs:number,rpcMs:number,
 *   ratio:number,withinBudget:boolean
 * }>}
 */
async function profile(){
  const source=(await fs.readFile(path.join(ROOT,'before/mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const compiled=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {privateNames:['protectedDigest'],seed:SEED,allowServerImports:true}
  );
  const native=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(compiled,native);
  const session='allowed-local-research-only';
  const server=http.createServer(createScoHandler([compiled.clientFile],{
    remoteMethods:methods,
    authorizeRead:req=>req.headers['x-bench-session']===session,
    authorizeRpc:req=>req.headers['x-bench-session']===session,
    authorizeOperation:(req,method,args)=>
      req.headers['x-bench-session']===session &&
      method===compiled.methodNames.protectedDigest &&
      args.length===1 && typeof args[0]==='string' && args[0].length<=8192
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected TCP listener');
  const origin='http://127.0.0.1:'+address.port;
  const originalFetch=globalThis.fetch;
  try {
    const denied=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:compiled.methodNames.protectedDigest,args:['value']})
    });
    assert.equal(denied.status,403);
    globalThis.fetch=(route,options)=>originalFetch(new URL(String(route),origin),{
      ...options,headers:{...options?.headers,'x-bench-session':session}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(compiled.clientFile.code));
    const value='a moderately long authenticated request '+('abc123'.repeat(100));
    const expected=await native.protectedDigest(value);
    assert.equal(await client.protectedDigest(value),expected);
    for(let i=0;i<3;i++){
      await native.protectedDigest(value);
      await client.protectedDigest(value);
    }
    /** @type {number[]} */
    const nativeMs=[];
    /** @type {number[]} */
    const rpcMs=[];
    for(let i=0;i<10;i++){
      for(const kind of i%2===0?['native','rpc']:['rpc','native']){
        const start=performance.now();
        const result=kind==='native'?
          await native.protectedDigest(value):await client.protectedDigest(value);
        const elapsed=performance.now()-start;
        assert.equal(result,expected);
        (kind==='native'?nativeMs:rpcMs).push(elapsed);
      }
    }
    const nativeMedian=median(nativeMs);
    const rpcMedian=median(rpcMs);
    return {
      node:process.version,platform:process.platform,
      privateBytes:Buffer.byteLength(source),
      clientBytes:Buffer.byteLength(compiled.clientFile.code),
      rounds:12000,unauthorizedStatus:denied.status,
      nativeMs:Number(nativeMedian.toFixed(6)),
      rpcMs:Number(rpcMedian.toFixed(6)),
      ratio:Number((rpcMedian/nativeMedian).toFixed(6)),
      withinBudget:rpcMedian/nativeMedian<=2.5
    };
  }finally{
    globalThis.fetch=originalFetch;
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)profile().then(output=>{
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={profile};
