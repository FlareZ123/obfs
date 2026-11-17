'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {
  partitionScoSelectedGraph,createScoSelectedGraphHandler
}=require('../src');

const modes=[
  {path:'alpha.mjs',seed:1021,constant:1664525},
  {path:'beta.mjs',seed:2083,constant:22695477}
];

/**
 * @param {{path:string,seed:number,constant:number}} mode
 * @returns {string}
 */
function originalSource(mode){
  return 'const PRIVATE_KEY_'+mode.seed+'='+mode.seed+';\n'+
    'export async function secret(rounds){'+
      'let state=PRIVATE_KEY_'+mode.seed+'|0;'+
      'for(let i=0;i<rounds;i++){state=Math.imul(state^i,'+mode.constant+')|0;}'+
      'return state;}\n'+
    'export function local(value){return value^'+mode.seed+';}\n'+
    'export async function combined(rounds){return (await secret(rounds))^local(rounds);}\n';
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function listen(server){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Unexpected listener address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * Paired warm two-module sessions, with the same private computation executed
 * by the native path and the generated SCO RPC path. HTTP authentication and
 * JSON transport count against client-side runtime. No TLS/WAN, browser,
 * network startup or cold-import cost is represented by this sample.
 *
 * @returns {Promise<{node:string,platform:string,sourceSHA256:string[],publicSHA256:string[],withheldCanary:boolean,levels:{rounds:number,nativeMs:number[],remoteMs:number[],medianNativeMs:number,medianRemoteMs:number,ratio:number}[]}>}
 */
async function runBudget(){
  const units=modes.map(mode=>({
    file:{path:mode.path,code:originalSource(mode),sourceType:/** @type {'module'} */ ('module')},
    options:{seed:'sco-selected-budget-20261117',privateNames:['secret']}
  }));
  const graph=partitionScoSelectedGraph(units);
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    /** @type {Record<string,Record<string,unknown>>} */
    const namespaces=Object.create(null);
    for(const unit of units){
      namespaces[unit.file.path]=await import('data:text/javascript,'+
        encodeURIComponent(unit.file.code));
    }
    const token='budget-verified-session';
    server=http.createServer(createScoSelectedGraphHandler(graph,namespaces,{
      authorizeRead:req=>req.headers['x-test-session']===token,
      authorizeRpc:req=>req.headers['x-test-session']===token,
      authorizeOperation:(req,_method,args)=>req.headers['x-test-session']===token&&
        args.length===1&&Number.isSafeInteger(args[0])&&
        Number(args[0])>=0&&Number(args[0])<=8000000
    }));
    const origin=await listen(server);
    globalThis.fetch=(url,options)=>nativeFetch(
      new URL(/** @type {string} */ (url),origin),{
        ...options,headers:{...options?.headers,'x-test-session':token}
      });
    /** @type {Record<string,Record<string,unknown>>} */
    const clients=Object.create(null);
    for(const file of graph.clientFiles){
      assert.doesNotMatch(file.code,/PRIVATE_KEY_/u);
      clients[file.path]=await import('data:text/javascript,'+
        encodeURIComponent(file.code));
    }
    /** @param {number} rounds @param {'native'|'remote'} mode @returns {Promise<number[]>} */
    async function session(rounds,mode){
      /** @type {number[]} */
      const outputs=[];
      for(const filename of graph.exposedPaths){
        const namespace=mode==='native'?namespaces[filename]:clients[filename];
        const combined=/** @type {(n:number)=>Promise<number>} */ (namespace.combined);
        outputs.push(await combined(rounds));
      }
      return outputs;
    }
    for(const rounds of [0,1000,100000]){
      assert.deepEqual(await session(rounds,'native'),await session(rounds,'remote'));
    }
    const levels=[];
    for(const rounds of [1,100000,1000000,8000000]){
      /** @type {number[]} */
      const nativeMs=[];
      /** @type {number[]} */
      const remoteMs=[];
      for(let trial=0;trial<9;trial++){
        const sequence=trial%2===0?['native','remote']:['remote','native'];
        /** @type {number[]|undefined} */
        let originalResult;
        /** @type {number[]|undefined} */
        let remoteResult;
        for(const kind of sequence){
          const mode=/** @type {'native'|'remote'} */ (kind);
          const start=performance.now();
          const output=await session(rounds,mode);
          const elapsed=performance.now()-start;
          if(mode==='native'){nativeMs.push(elapsed);originalResult=output;}
          else{remoteMs.push(elapsed);remoteResult=output;}
        }
        assert.deepEqual(originalResult,remoteResult);
      }
      const medianNativeMs=median(nativeMs);
      const medianRemoteMs=median(remoteMs);
      levels.push({rounds,nativeMs,remoteMs,medianNativeMs,
        medianRemoteMs,ratio:medianRemoteMs/medianNativeMs});
    }
    return {
      node:process.version,platform:process.platform,
      sourceSHA256:units.map(unit=>createHash('sha256').update(unit.file.code).digest('hex')),
      publicSHA256:graph.clientFiles.map(file=>createHash('sha256').update(file.code).digest('hex')),
      withheldCanary:graph.clientFiles.every(file=>!file.code.includes('PRIVATE_KEY_')),
      levels
    };
  }finally{
    globalThis.fetch=nativeFetch;
    if(server)await close(server);
  }
}

if(require.main===module){
  runBudget().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runBudget};
