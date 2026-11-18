'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {fork}=require('node:child_process');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {ROOT,EXPOSED,build}=require('../examples/application-challenge/sco-build.cjs');
const {externalValue}=require('../examples/application-challenge/sco-server.cjs');
const {atomicWrite}=require('../src/atomic');

const A_SEED=0xa1a1a1a1,B_SEED=0xb2b2b2b2;
const A_COUNT=1000,B_COUNT=1,BATCH_SIZE=1024;

/** @typedef {{phase:'ready'|'result'|'error',submittedNs?:string,
 * elapsedMs?:number,status?:number,output?:unknown,error?:string}} ChildReply */
/** @typedef {{signalPath:string,firstNs:bigint|null,
 * lastNs:bigint|null,seen:number}} ActiveTrial */
/** @typedef {{quietMs:number,loadedMs:number,ratio:number,
 * attackerBusyMs:number,submittedDuringAttacker:boolean}} Row */

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const values=[...numbers].sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

/**
 * Start the same independent child HTTP client for the quiet and contended
 * controls. The parent publishes an atomic start marker before the child
 * transmits its legitimate, authenticated batch request.
 * @param {string} origin
 * @param {string} bearer
 * @param {string} signalPath
 * @param {string} batchMethod
 * @param {string} directMethod
 * @returns {{child:import('node:child_process').ChildProcess,
 * ready:Promise<void>,result:Promise<ChildReply>}}
 */
function prepareVictim(origin,bearer,signalPath,batchMethod,directMethod){
  const child=fork(require.resolve('./sco-batch-contention-worker.cjs'),[
    origin,bearer,signalPath,batchMethod,directMethod,
    String(B_SEED),String(B_COUNT),EXPOSED
  ],{silent:true});
  /** @type {(value:void)=>void} */
  let successReady=()=>{};
  /** @type {(value:ChildReply)=>void} */
  let successResult=()=>{};
  /** @type {(error:unknown)=>void} */
  let failReady=()=>{};
  /** @type {(error:unknown)=>void} */
  let failResult=()=>{};
  const ready=/** @type {Promise<void>} */(new Promise((resolve,reject)=>{
    successReady=resolve;failReady=reject;
  }));
  const result=/** @type {Promise<ChildReply>} */(new Promise((resolve,reject)=>{
    successResult=resolve;failResult=reject;
  }));
  let finished=false;
  child.on('message',/** @param {ChildReply} msg */msg=>{
    if(msg.phase==='ready')successReady();
    else if(msg.phase==='result'){
      finished=true;successResult(msg);
    }else if(msg.phase==='error'){
      const error=new Error(msg.error??'Victim child failed');
      failReady(error);failResult(error);
    }
  });
  child.on('error',error=>{failReady(error);failResult(error);});
  child.on('exit',code=>{
    if(!finished){
      const error=new Error('Victim child exited before result: '+code);
      failReady(error);failResult(error);
    }
  });
  return {child,ready,result};
}

/**
 * Tiny one-shot signal. The exclusive temporary write followed by an atomic
 * same-directory rename ensures the victim never reads a partial marker.
 * Each path belongs to a new temporary folder and is written once.
 * @param {string} filename
 * @returns {void}
 */
function signal(filename){
  fs.writeFileSync(filename+'.tmp','go',{flag:'wx'});
  fs.renameSync(filename+'.tmp',filename);
}

/**
 * Under a single trusted Node event loop, a fully authorized A submits a
 * 1024-call original private SCO batch (1000 iterations/call). A separate
 * legitimate B child sends one 1-iteration call as a 1-item real batch while
 * the original private implementation is running for A. A matched separate
 * child/HTTP/service idle B control runs in each trial. The experiment keeps
 * value equality, distinct bearer tokens and exact monotonic overlap proof.
 *
 * @param {number} [rounds]
 * @returns {Promise<{
 *  source:string,platform:NodeJS.Platform,node:string,
 *  attackerOperations:number,attackerIterationsPerCall:number,
 *  victimOperations:number,victimIterationsPerCall:number,
 *  distinctAccountBearers:boolean,clientFetchPrewarmed:boolean,
 *  overlapCount:number,overTwoPointFiveLoadedVsQuiet:number,
 *  medianLoadedOverQuiet:number,maximumLoadedOverQuiet:number,
 *  rows:Row[],limitation:string
 * }>}
 */
async function run(rounds=9){
  if(!Number.isSafeInteger(rounds)||rounds<5||rounds>20)
    throw RangeError('Expected 5 to 20 independent matched contention trials');
  const beforeWindow=globalThis.window;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-real-batch-contention-'));
  /** @type {http.Server|undefined} */
  let server;
  try{
    globalThis.window=/** @type {Window & typeof globalThis} */ (
      /** @type {unknown} */ ({externalValue}));
    const graph=await build();
    const source=await fsp.readFile(path.join(ROOT,EXPOSED),'utf8');
    const partition=partitionScoAsyncModule({
      path:EXPOSED,code:source,sourceType:'module'
    },{
      seed:'sco-batch-contention-20261118',
      serverOnlyInitialization:true,batch:true,maxBatchCalls:1024
    });
    assert.deepEqual(partition.names,['evaluateRemote']);
    assert.ok(partition.batchMethod);
    const original=/** @type {{evaluateRemote:(seed:number,count:number)=>Promise<unknown>}} */(
      await import(pathToFileURL(path.join(ROOT,EXPOSED)).href));
    /** @type {ActiveTrial|null} */
    let active=null;
    const instrumented={
      /**
       * @param {number} seed
       * @param {number} count
       * @returns {Promise<unknown>}
       */
      async evaluateRemote(seed,count){
        const current=active;
        if(current&&seed===A_SEED&&count===A_COUNT){
          if(current.seen===0){
            current.firstNs=process.hrtime.bigint();
            signal(current.signalPath);
          }
          const result=await original.evaluateRemote(seed,count);
          current.seen++;
          if(current.seen===BATCH_SIZE)current.lastNs=process.hrtime.bigint();
          return result;
        }
        return original.evaluateRemote(seed,count);
      }
    };
    const registry=bindScoModuleExports(partition,instrumented);
    partition.clientFile.privateModulePaths=[...graph.privatePaths];
    partition.clientFile.privateOriginalDigests=graph.privateSourceDigests.map(
      item=>item.sha256);
    const aBearer=randomBytes(24).toString('hex');
    const bBearer=randomBytes(24).toString('hex');
    assert.notEqual(aBearer,bBearer);
    const aExpected=Buffer.from(aBearer),bExpected=Buffer.from(bBearer);
    /** @param {http.IncomingMessage} req @returns {'A'|'B'|null} */
    function principal(req){
      const actual=Buffer.from(String(req.headers['x-batch-token']??''));
      if(actual.length===aExpected.length&&timingSafeEqual(actual,aExpected))
        return 'A';
      if(actual.length===bExpected.length&&timingSafeEqual(actual,bExpected))
        return 'B';
      return null;
    }
    const directMethod=partition.methodNames.evaluateRemote;
    const batchMethod=partition.batchMethod;
    const handler=createScoHandler([partition.clientFile],{
      publicPaths:[EXPOSED],remoteMethods:registry,maxRpcBytes:262144,
      authorizeRead:req=>principal(req)!==null,
      authorizeRpc:req=>principal(req)!==null,
      authorizeOperation:(req,method,args)=>{
        const account=principal(req);
        if(!account)return false;
        if(method===batchMethod){
          if(args.length!==1||!Array.isArray(args[0])||
              args[0].length===0||args[0].length>BATCH_SIZE)return false;
          let work=0;
          for(const call of args[0]){
            if(!call||typeof call!=='object'||call.method!==directMethod||
                !Array.isArray(call.args)||call.args.length!==2||
                typeof call.args[0]!=='number'||!Number.isInteger(call.args[0])||
                call.args[0]<0||call.args[0]>0xffffffff||
                typeof call.args[1]!=='number'||!Number.isInteger(call.args[1])||
                call.args[1]<0||call.args[1]>150000)return false;
            work+=call.args[1];
            if(work>BATCH_SIZE*A_COUNT)return false;
          }
          return true;
        }
        return method===directMethod&&args.length===2&&
          typeof args[0]==='number'&&Number.isInteger(args[0])&&
          args[0]>=0&&args[0]<=0xffffffff&&
          typeof args[1]==='number'&&Number.isInteger(args[1])&&
          args[1]>=0&&args[1]<=150000;
      }
    });
    server=http.createServer(handler);
    await new Promise(resolve=>server?.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Expected loopback port');
    const origin='http://127.0.0.1:'+addr.port;
    assert.equal((await fetch(origin+'/obfs/'+EXPOSED)).status,403);
    const sourceReply=await fetch(origin+'/obfs/'+EXPOSED,{
      headers:{'x-batch-token':aBearer}
    });
    assert.equal(sourceReply.status,200);
    const servedSource=await sourceReply.text();
    assert.ok(servedSource.includes('export async function batch('),
      'A genuinely batch-enabled public ESM must be served');
    assert.ok(!servedSource.includes('createEngine'));
    /** @type {Array<{method:string,args:number[]}>} */
    const aInputs=Array.from({length:BATCH_SIZE},()=>({
      method:directMethod,args:[A_SEED,A_COUNT]
    }));
    const nativeB=JSON.stringify(await original.evaluateRemote(B_SEED,B_COUNT));
    /** @returns {Promise<Array<{ok:boolean,value:unknown}>>} */
    async function attackerBatch(){
      const response=await fetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'x-batch-token':aBearer,'content-type':'application/json'},
        body:JSON.stringify({method:batchMethod,args:[aInputs]})
      });
      assert.equal(response.status,200);
      const payload=/** @type {{ok:boolean,value:Array<{ok:boolean,value:unknown}>}} */(
        await response.json());
      assert.equal(payload.ok,true);
      assert.equal(payload.value.length,BATCH_SIZE);
      assert.equal(payload.value.every(item=>item.ok),true);
      return payload.value;
    }
    /** @type {Row[]} */
    const rows=[];
    for(let trial=0;trial<rounds;trial++){
      const quietPath=path.join(folder,'quiet-'+trial+'.signal');
      const quiet=prepareVictim(origin,bBearer,quietPath,batchMethod,directMethod);
      /** @type {number} */
      let quietMs;
      try{
        await quiet.ready;
        signal(quietPath);
        const result=await quiet.result;
        assert.equal(result.status,200);
        assert.equal(JSON.stringify(result.output),nativeB);
        assert.ok(result.elapsedMs!==undefined&&result.elapsedMs>0);
        quietMs=result.elapsedMs;
      }finally{
        quiet.child.kill();
      }
      const signalPath=path.join(folder,'active-'+trial+'.signal');
      active={signalPath,firstNs:null,lastNs:null,seen:0};
      const contended=prepareVictim(
        origin,bBearer,signalPath,batchMethod,directMethod);
      try{
        await contended.ready;
        const attacker=attackerBatch();
        const b=await contended.result;
        await attacker;
        assert.equal(b.status,200);
        assert.equal(JSON.stringify(b.output),nativeB);
        assert.ok(b.submittedNs&&b.elapsedMs!==undefined&&b.elapsedMs>0);
        assert.equal(active.seen,BATCH_SIZE);
        const first=active.firstNs,last=active.lastNs;
        assert.ok(first!==null&&last!==null);
        const submitted=BigInt(b.submittedNs);
        assert.ok(submitted>=first&&submitted<last,
          'Independent Account B did not submit while Account A private work executed');
        const busyMs=Number(last-first)/1e6;
        rows.push({
          quietMs,loadedMs:b.elapsedMs,ratio:b.elapsedMs/quietMs,
          attackerBusyMs:busyMs,submittedDuringAttacker:true
        });
      }finally{
        contended.child.kill();
        active=null;
      }
    }
    assert.equal(rows.length,rounds);
    return {
      source:'sims/sco-batch-cross-account-contention.js',
      platform:process.platform,node:process.version,
      attackerOperations:BATCH_SIZE,attackerIterationsPerCall:A_COUNT,
      victimOperations:1,victimIterationsPerCall:B_COUNT,
      distinctAccountBearers:true,clientFetchPrewarmed:true,overlapCount:rows.length,
      overTwoPointFiveLoadedVsQuiet:rows.filter(s=>s.ratio>2.5).length,
      medianLoadedOverQuiet:median(rows.map(s=>s.ratio)),
      maximumLoadedOverQuiet:Math.max(...rows.map(s=>s.ratio)),
      rows,limitation:'Single-event-loop, same-process trusted Node HTTP server; authenticated A burst at aggregate cap, one prewarmed B request measured from a separate process against matched prewarmed quiet B control. Relative quiet B latency is a queue-fairness metric, not a direct original-to-obfuscated CPU bound.'
    };
  }finally{
    if(server){
      const activeServer=server;
      await new Promise((resolve,reject)=>activeServer.close(
        error=>error?reject(error):resolve(undefined)));
    }
    fs.rmSync(folder,{recursive:true,force:true});
    if(beforeWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=beforeWindow;
  }
}
if(require.main===module)run().then(async result=>{
  if(process.env.OBFS_SCO_BATCH_CONTENTION_AUDIT_FILE)
    await atomicWrite(process.env.OBFS_SCO_BATCH_CONTENTION_AUDIT_FILE,
      JSON.stringify(result,null,2)+'\n');
  process.stdout.write('SCO_BATCH_CONTENTION '+JSON.stringify(result)+'\n');
}).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={run,prepareVictim};
