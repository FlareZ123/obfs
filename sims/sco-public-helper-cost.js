'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-public-helpers');
const SESSION_CALLS=350000;
const THIN_CALLS=64;

/** @param {number[]} samples @returns {number} */
function median(samples){
  const values=[...samples].sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

/**
 * Pair real HTTP loopback RPC and native calls on exactly the same source
 * inputs. Measures thin calls separately from 350k local-public-operations
 * sessions. No remote WAN, TLS, Chromium or cold-start budget is inferred.
 * @returns {Promise<{thinCalls:number,sessionCalls:number,
 *  thinNativeMedianMs:number,thinClientMedianMs:number,thinRatio:number,
 *  sessionNativeMedianMs:number,sessionClientMedianMs:number,
 *  sessionRatio:number,thinWithinBudget:boolean,sessionWithinBudget:boolean}>}
 */
async function runCost(){
  const source=(await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const generated=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{
    seed:'sco-public-helpers-20261115-example',
    privateNames:['secret'],publicHelperNames:['normalizeInput','formatCount']
  });
  const golden=(await fs.readFile(path.join(ROOT,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  assert.equal(generated.clientFile.code,golden);
  const original=await import(pathToFileURL(path.join(ROOT,'before','mixed.mjs')).href);
  const methods=bindScoModuleExports(generated,original);
  const token='sco-public-helper-cost-test';
  const server=http.createServer(createScoHandler([generated.clientFile],{
    remoteMethods:methods,
    authorizeRead:req=>req.headers['x-session']===token,
    authorizeRpc:req=>req.headers['x-session']===token,
    authorizeOperation:(req,method,args)=>req.headers['x-session']===token&&
      method===generated.methodNames.secret&&args.length===1&&typeof args[0]==='string'
  }));
  const nativeFetch=globalThis.fetch;
  /** @type {number[]} */
  const thinNative=[];
  /** @type {number[]} */
  const thinClient=[];
  /** @type {number[]} */
  const sessionNative=[];
  /** @type {number[]} */
  const sessionClient=[];
  try{
    /** @type {Promise<void>} */
    const started=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
    await started;
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected cost-test HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    globalThis.fetch=(url,options)=>nativeFetch(new URL(/** @type {string} */ (url),origin),{
      ...options,headers:{...options?.headers,'x-session':token}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(generated.clientFile.code));
    /** @param {'native'|'client'} mode @param {'thin'|'session'} workload @returns {Promise<{elapsed:number,output:string}>} */
    async function sample(mode,workload){
      const module=mode==='native'?original:client;
      const start=performance.now();
      if(workload==='thin'){
        let output='';
        for(let i=0;i<THIN_CALLS;i++){
          output+=(await module.secret('secret-'+(i%8)))+',';
        }
        return {elapsed:performance.now()-start,output};
      }
      let checksum=0;
      for(let i=0;i<SESSION_CALLS;i++){
        checksum=(checksum+module.normalize('  Mixed  ').length+(i&15))|0;
      }
      const output=checksum+'|'+await module.combined('  Alpha  ');
      return {elapsed:performance.now()-start,output};
    }
    for(const workload of ['thin','session']){
      await sample('native',/** @type {'thin'|'session'} */ (workload));
      await sample('client',/** @type {'thin'|'session'} */ (workload));
      for(let trial=0;trial<6;trial++){
        /** @type {{elapsed:number,output:string}|undefined} */
        let first;
        for(const mode of (trial%2?['client','native']:['native','client'])){
          const measured=await sample(/** @type {'native'|'client'} */ (mode),
            /** @type {'thin'|'session'} */ (workload));
          if(first)assert.equal(measured.output,first.output);
          else first=measured;
          const bucket=workload==='thin'?
            (mode==='native'?thinNative:thinClient):
            (mode==='native'?sessionNative:sessionClient);
          bucket.push(measured.elapsed);
        }
      }
    }
    const thinNativeMedianMs=median(thinNative);
    const thinClientMedianMs=median(thinClient);
    const sessionNativeMedianMs=median(sessionNative);
    const sessionClientMedianMs=median(sessionClient);
    const thinRatio=thinClientMedianMs/thinNativeMedianMs;
    const sessionRatio=sessionClientMedianMs/sessionNativeMedianMs;
    return {thinCalls:THIN_CALLS,sessionCalls:SESSION_CALLS,
      thinNativeMedianMs,thinClientMedianMs,thinRatio,
      sessionNativeMedianMs,sessionClientMedianMs,sessionRatio,
      thinWithinBudget:thinRatio<=2.5,sessionWithinBudget:sessionRatio<=2.5};
  }finally{
    globalThis.fetch=nativeFetch;
    /** @type {Promise<void>} */
    const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await ended;
  }
}

if(require.main===module){
  runCost().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runCost};
