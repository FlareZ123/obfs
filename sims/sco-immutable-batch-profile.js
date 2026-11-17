'use strict';

const {performance}=require('node:perf_hooks');
const {createServer}=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * Measure the full authenticated local HTTP handler rather than only JSON.parse.
 * Native user logic is intentionally read-only; immutableBatchArgs is an
 * opt-in API contract, and this script makes no 2.5x versus-native assertion.
 * @param {number[]} values
 * @returns {number}
 */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * @param {boolean} immutableBatchArgs
 * @returns {Promise<{server:import('node:http').Server,port:number}>}
 */
async function start(immutableBatchArgs){
  const handler=createScoHandler([],{
    immutableBatchArgs,
    remoteMethods:{batch:createScoBatchMethod({
      /** @param {{n:number,text:string}} input */
      read:input=>input.n+input.text.length
    },{maxCalls:1024})},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method)=>method==='batch'||method==='read'
  });
  const server=createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing server port');
  return {server,port:address.port};
}

/**
 * @param {number} port
 * @param {string} payload
 * @param {number} count
 * @returns {Promise<number>}
 */
async function sample(port,payload,count){
  const startTime=performance.now();
  for(let i=0;i<count;i++){
    const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:payload
    });
    if(response.status!==200)throw new Error('Unexpected HTTP '+response.status);
    const body=/** @type {{ok:boolean,value:unknown[]}} */(await response.json());
    if(!body.ok || !Array.isArray(body.value))throw new Error('Invalid result');
  }
  return (performance.now()-startTime)/count;
}

async function main(){
  const normal=await start(false);
  const immutable=await start(true);
  try{
    for(const size of [1,20,60,128,256,512]){
      const calls=Array.from({length:size},(_,i)=>({
        method:'read',args:[{n:i,text:'x'.repeat(80)}]
      }));
      const payload=JSON.stringify({method:'batch',args:[calls]});
      await sample(normal.port,payload,10);
      await sample(immutable.port,payload,10);
      /** @type {number[]} */
      const ordinaryTimes=[];
      /** @type {number[]} */
      const immutableTimes=[];
      for(let trial=0;trial<9;trial++){
        /** @type {[number,number[]][]} */
        const order=trial%2===0?
          [[normal.port,ordinaryTimes],[immutable.port,immutableTimes]]:
          [[immutable.port,immutableTimes],[normal.port,ordinaryTimes]];
        for(const [port,times] of order){
          const measured=await sample(/** @type {number} */(port),payload,30);
          /** @type {number[]} */(times).push(measured);
        }
      }
      const standardMs=median(ordinaryTimes);
      const frozenMs=median(immutableTimes);
      console.log(JSON.stringify({
        name:'SCO_IMMUTABLE_BATCH_HTTP',
        size,payloadBytes:Buffer.byteLength(payload,'utf8'),
        trials:9,requestsPerSample:30,
        standardMedianMs:standardMs,immutableMedianMs:frozenMs,
        immutableOverStandard:frozenMs/standardMs,
        standardSamplesMs:ordinaryTimes,
        immutableSamplesMs:immutableTimes
      }));
    }
  }finally{
    await Promise.all([normal,immutable].map(({server})=>{
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      return closed;
    }));
  }
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
