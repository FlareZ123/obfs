'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createServer}=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * @param {number[]} samples
 * @returns {number}
 */
function median(samples){
  const ordered=[...samples].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * @param {boolean} immutableBatchArgs
 * @returns {Promise<{server:import('node:http').Server,port:number}>}
 */
async function start(immutableBatchArgs){
  const handler=createScoHandler([],{
    immutableBatchArgs,
    remoteMethods:{batch:createScoBatchMethod({read:()=>37})},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  const server=createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected bound server');
  return {server,port:address.port};
}

/**
 * @param {number} port
 * @param {string} body
 * @param {number} n
 * @returns {Promise<{wallMs:number,cpuUs:number}>}
 */
async function sample(port,body,n){
  const beginning=performance.now();
  const cpu=process.cpuUsage();
  for(let i=0;i<n;i++){
    const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body
    });
    assert.equal(response.status,200,'HTTP status');
    assert.deepEqual(await response.json(),{ok:true,value:[{ok:true,value:37}]});
  }
  const used=process.cpuUsage(cpu);
  return {
    wallMs:(performance.now()-beginning)/n,
    cpuUs:(used.user+used.system)/n
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function batch(value){
  return '{"method":"batch","args":[[{"method":"read","args":['+value+']}]]}';
}

/**
 * @param {number} depth
 * @returns {string}
 */
function deep(depth){
  return '['.repeat(depth)+'37'+']'.repeat(depth);
}

/**
 * @param {number} count
 * @returns {string}
 */
function wide(count){
  return '{'+Array.from({length:count},(_,i)=>'"field'+i+'":'+i).join(',')+'}';
}

/**
 * @returns {Promise<void>}
 */
async function main(){
  const shapes=[
    {name:'scalar',input:'37'},
    {name:'deep-2048',input:deep(2048)},
    {name:'deep-5000',input:deep(5000)},
    {name:'wide-2048',input:wide(2048)},
    {name:'wide-3500',input:wide(3500)}
  ];
  const normal=await start(false);
  const frozen=await start(true);
  try{
    for(const shape of shapes){
      const body=batch(shape.input);
      assert.ok(Buffer.byteLength(body)<=65536,'Within default SCO 64KiB admission');
      for(const server of [normal,frozen])await sample(server.port,body,10);
      /** @type {number[]} */
      const defaultWall=[],frozenWall=[],defaultCpu=[],frozenCpu=[];
      for(let t=0;t<9;t++){
        const order=t%2===0?[['default',normal],['frozen',frozen]]:
          [['frozen',frozen],['default',normal]];
        for(const [name,server] of /** @type {Array<['default'|'frozen',typeof normal]>} */ (order)){
          const value=await sample(server.port,body,30);
          if(name==='default'){defaultWall.push(value.wallMs);defaultCpu.push(value.cpuUs);}
          else{frozenWall.push(value.wallMs);frozenCpu.push(value.cpuUs);}
        }
      }
      const result={
        kind:'SCO_IMMUTABLE_SHAPE_CPU',
        shape:shape.name,
        payloadBytes:Buffer.byteLength(body),
        trials:9,requestsPerTrial:30,
        allOutputsEqual:true,
        defaultWallMedianMs:median(defaultWall),
        frozenWallMedianMs:median(frozenWall),
        frozenOverDefaultWall:median(frozenWall)/median(defaultWall),
        defaultCpuMedianUs:median(defaultCpu),
        frozenCpuMedianUs:median(frozenCpu),
        frozenOverDefaultCpu:median(frozenCpu)/median(defaultCpu),
        defaultWallSamplesMs:defaultWall,frozenWallSamplesMs:frozenWall,
        defaultCpuSamplesUs:defaultCpu,frozenCpuSamplesUs:frozenCpu,
        note:'one shared localhost Node process; CPU includes HTTP client+server; batch shape only'
      };
      console.log(JSON.stringify(result));
    }
  }finally{
    await Promise.all([normal,frozen].map(({server})=>{
      /** @type {Promise<void>} */
      const stopped=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      return stopped;
    }));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
