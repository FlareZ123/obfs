'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {learnMachine,learnedTrace,privateTrace}=require('./sco-stateful-oracle');

/** @typedef {{next:number[][],output:number[][]}} PrivateMachine */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */

/**
 * Construct a deterministic four-state Mealy machine with no reset method.
 * Symbol 0 reduces the state index, so 000 synchronizes from every state
 * to 0. Symbol 1 advances cyclically and makes all states reachable.
 * Outputs reveal a 0011 pattern plus seeded private variations.
 * @param {number} seed
 * @returns {PrivateMachine}
 */
function makeSynchronizingMachine(seed) {
  let value=seed>>>0;
  /** @returns {number} */
  function nextRandom() {
    value=(Math.imul(value,1664525)+1013904223)>>>0;
    return value;
  }
  const next=[];
  const output=[];
  for(let state=0;state<4;state++) {
    next.push([Math.max(0,state-1),(state+1)%4]);
    output.push([[0,0,1,1][state],(nextRandom()>>>16)&1]);
  }
  return {next,output};
}

/**
 * Use a known synchronizing *input sequence* as an attacker-side logical
 * reset. No reset method exists in the published server module. Each
 * logical reset costs three additional authorized step requests, tracked
 * separately from the abstract learner's query counter.
 *
 * @param {StepOnlyOracle} api
 * @param {readonly number[]} synchronizingWord
 * @returns {Promise<{machine:import('./sco-stateful-oracle').LearnedMachine,
 *   rpcSteps:number,logicalRequests:number,resetCalls:number,elapsedMs:number}>}
 */
async function recoverWithoutReset(api,synchronizingWord=[0,0,0]) {
  if(!synchronizingWord.length||synchronizingWord.some(symbol=>symbol!==0)) {
    throw new TypeError('Expected the fixed verified synchronizing word 000');
  }
  let rpcSteps=0;
  let resetCalls=0;
  /** @param {number} symbol @returns {Promise<number>} */
  async function step(symbol) {
    rpcSteps++;
    return api.step(symbol);
  }
  const learned=await learnMachine({
    async reset(){
      resetCalls++;
      for(const symbol of synchronizingWord)await step(symbol);
      return true;
    },
    step
  },4,2);
  return {machine:learned.machine,rpcSteps,logicalRequests:learned.requests,
    resetCalls,elapsedMs:learned.elapsedMs};
}

/**
 * Recover all observable states through a real authenticated step-only SCO
 * proxy, while the hidden ESM machine has no reset export.
 * @param {number} index
 * @returns {Promise<{index:number,states:number,rpcSteps:number,logicalRequests:number,
 *   resetCalls:number,heldout:number,publicResetExport:boolean,unauthorizedStatus:number,
 *   sourceDisclosed:boolean,elapsedMs:number}>}
 */
async function scenario(index) {
  const secret=makeSynchronizingMachine((0x5f3a17d2+Math.imul(index,3317))>>>0);
  const canary='private-sync-canary-'+index;
  const source=[
    'const model='+JSON.stringify(secret)+';',
    'const canary='+JSON.stringify(canary)+';',
    'let current=0;',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>=2)throw TypeError("symbol");',
    'const old=current;current=model.next[old][symbol];return model.output[old][symbol];',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({path:'client.mjs',sourceType:'module',code:source},{
    seed:'sco-sync-state-'+index,serverOnlyInitialization:true
  });
  assert.deepEqual(partition.names,['step']);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sync-oracle-'));
  /** @type {http.Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try {
    const privateFile=path.join(root,'private','actual.mjs');
    await atomicWrite(privateFile,source);
    const privateModule=await import(pathToFileURL(privateFile).href);
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,privateModule),
      authorizeRpc:request=>request.headers.cookie==='session=approved',
      authorizeOperation:(request,method,args)=>
        request.headers.cookie==='session=approved' &&
        method===partition.methodNames.step &&
        args.length===1 && Number.isInteger(args[0]) && args[0]>=0 && args[0]<=1
    }));
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const response=await nativeFetch(origin+'/obfs/client.mjs');
    assert.equal(response.status,200);
    const publicSource=await response.text();
    assert.equal(publicSource.includes(canary),false);
    assert.equal(publicSource.includes('model.next'),false);
    assert.equal(publicSource.includes('model.output'),false);
    const publicFile=path.join(root,'public','client.mjs');
    await atomicWrite(publicFile,publicSource);

    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.step,args:[0]})
    });
    assert.equal(denied.status,403);
    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),origin),{
      ...options,headers:{...options?.headers,cookie:'session=approved'}
    });
    const api=/** @type {StepOnlyOracle & {reset?:()=>unknown}} */(await import(pathToFileURL(publicFile).href));
    assert.equal(api.reset,undefined,'Unexpected public reset method');
    const learned=await recoverWithoutReset(api);
    assert.equal(learned.machine.access.length,4);
    let heldout=0;
    /** @type {number[][]} */
    let layer=[[]];
    for(let length=1;length<=10;length++) {
      /** @type {number[][]} */
      const next=[];
      for(const prefix of layer)for(let bit=0;bit<2;bit++) {
        const word=[...prefix,bit];
        next.push(word);
        assert.deepEqual(learnedTrace(learned.machine,word),privateTrace(secret,word));
        heldout++;
      }
      layer=next;
    }
    assert.equal(heldout,2046);
    assert.equal(learned.rpcSteps,learned.logicalRequests+2*learned.resetCalls);
    return {index,states:learned.machine.access.length,rpcSteps:learned.rpcSteps,
      logicalRequests:learned.logicalRequests,resetCalls:learned.resetCalls,
      heldout,publicResetExport:false,unauthorizedStatus:denied.status,
      sourceDisclosed:false,elapsedMs:learned.elapsedMs};
  }finally{
    globalThis.fetch=nativeFetch;
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {number} [count]
 * @returns {Promise<{scenarios:number,rpcSteps:number,heldout:number,allExact:boolean,
 *   details:Awaited<ReturnType<typeof scenario>>[]}>}
 */
async function runSynchronizing(count=4) {
  if(!Number.isSafeInteger(count)||count<1||count>12)throw new RangeError('count must be 1..12');
  /** @type {Awaited<ReturnType<typeof scenario>>[]} */
  const details=[];
  for(let index=0;index<count;index++)details.push(await scenario(index));
  return {scenarios:count,rpcSteps:details.reduce((sum,item)=>sum+item.rpcSteps,0),
    heldout:details.reduce((sum,item)=>sum+item.heldout,0),
    allExact:details.every(item=>item.states===4 && !item.publicResetExport &&
      item.unauthorizedStatus===403 && !item.sourceDisclosed),
    details};
}

if(require.main===module) {
  runSynchronizing().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={makeSynchronizingMachine,recoverWithoutReset,scenario,runSynchronizing};
