'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {randomBytes,createHash}=require('node:crypto');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{child:import('node:child_process').ChildProcess,base:string}} Worker */
/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * @param {string} databasePath
 * @param {Buffer} root
 * @param {string} tokenA
 * @param {string} tokenB
 * @param {string} control
 * @param {boolean} [legacyAnonymousLock] Test-only reproduction of old unauthenticated lock behavior.
 * @param {number} [journalModeRetries] Test-only startup retry control.
 * @param {boolean} [accountShards] Test-only verified-account file layout.
 * @param {string} [privateAMarker] Trusted test-only pre-long-HMAC marker path.
 * @param {number} [bucketCount] Trusted fixed root-keyed account bucket count.
 * @param {boolean} [nestedAccountQuota] Trust verified principal capacity separately from SQLite writer queue.
 * @param {number} [firstAGateMs] Trusted test-only asynchronous first A delay.
 * @param {boolean} [earlyAGate] Place state-independent A preparation before writer queue.
 * @returns {Promise<Worker>}
 */
async function launch(databasePath,root,tokenA,tokenB,control,legacyAnonymousLock=false,journalModeRetries=4,accountShards=false,privateAMarker='',bucketCount=0,nestedAccountQuota=false,firstAGateMs=0,earlyAGate=false){
  const child=spawn(process.execPath,[require.resolve('./sco-ratchet-transactional-http-child')],{
    env:{...process.env,SCO_TEST_DB:databasePath,SCO_TEST_ROOT:root.toString('hex'),
      SCO_TEST_TOKEN_A:tokenA,SCO_TEST_TOKEN_B:tokenB,SCO_TEST_CONTROL:control,
      SCO_TEST_LEGACY_UNAUTH_LOCK:legacyAnonymousLock?'1':'0',
      SCO_TEST_NO_JOURNAL_RETRY:journalModeRetries===0?'1':'0',
      SCO_TEST_ACCOUNT_SHARDS:accountShards?'1':'0',
      SCO_TEST_A_WORK_MARKER:privateAMarker,
      SCO_TEST_ACCOUNT_BUCKETS:String(bucketCount),
      SCO_TEST_NESTED_ACCOUNT_QUOTA:nestedAccountQuota?'1':'0',
      SCO_TEST_FIRST_A_GATE_MS:String(firstAGateMs),
      SCO_TEST_EARLY_A_GATE:earlyAGate?'1':'0'},
    stdio:['ignore','pipe','pipe']
  });
  if(!child.stdout||!child.stderr)throw new TypeError('Missing child output streams');
  const output=readline.createInterface({input:child.stdout});
  let errorLog='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{errorLog+=String(chunk).slice(0,4000);});
  /** @type {Promise<string>} */
  const started=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      child.kill('SIGKILL');
      reject(new Error('Trusted worker startup timeout; stderr='+errorLog.slice(-1000)));
    },15000);
    const finish=(/** @type {string|Error} */ value)=>{
      clearTimeout(timer);
      if(typeof value==='string')resolve(value);
      else reject(value);
    };
    output.once('line',finish);
    child.once('error',finish);
    child.once('exit',code=>finish(new Error(
      'Trusted worker exited before ready: '+code+'; stderr='+errorLog.slice(-1000))));
  });
  const ready=/** @type {{ready:boolean,port:number}} */(JSON.parse(await started));
  output.close();
  assert.equal(ready.ready,true);
  assert.ok(Number.isSafeInteger(ready.port)&&ready.port>0);
  return {child,base:'http://127.0.0.1:'+ready.port};
}

/**
 * @param {Worker} worker
 * @param {string} control
 * @returns {Promise<void>}
 */
async function stop(worker,control){
  const exit=once(worker.child,'exit');
  const response=await fetch(worker.base+'/__test__/stop',{
    method:'POST',headers:{'x-test-control':control}
  });
  assert.equal(response.status,204);
  const [code]=await exit;
  assert.equal(code,0);
}

/**
 * @param {string} base
 * @param {string|undefined} token
 * @param {number} seq
 * @param {string[]} inputs
 * @param {unknown[]} [override]
 * @returns {Promise<Reply>}
 */
async function call(base,token,seq,inputs,override){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:override??[seq,inputs]})
  });
  const value=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:value.value};
}

/**
 * @param {Buffer} root
 * @param {string} principal
 * @param {string[]} first
 * @param {string[]} next
 * @returns {{first:string[],next:string[]}}
 */
function native(root,principal,first,next){
  const machine=createPrivateMachine(root);
  const f=first.map((input,index)=>{
    const output=machine.advance(principal,index,input);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
  const n=next.map((input,index)=>{
    const output=machine.advance(principal,index+first.length,input);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
  return {first:f,next:n};
}

/**
 * Actual two-process authenticated SCO HTTP integration of the shared-state
 * repair. Each HTTP worker independently instantiates the regular SCO
 * handler and a separate SQLite connection. The single local database is
 * the common serialization boundary and is never published.
 *
 * @returns {Promise<object>}
 */
async function experiment(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ratchet-http-'));
  const dbPath=path.join(dir,'ratchet.sqlite');
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Worker[]} */
  const workers=[];
  const first=[challenge('first',0),challenge('first',1)];
  const options=[
    [challenge('branch-L',2),challenge('branch-L',3)],
    [challenge('branch-R',2),challenge('branch-R',3)]
  ];
  /** @param {string} principal @returns {{seq:number,committed:number}} */
  function snapshot(principal){
    const store=new TransactionalRatchet(dbPath,root);
    try{return store.snapshot(principal);}finally{store.close();}
  }
  try{
    // Startup initialization and WAL-mode selection are deliberately
    // serialized. Only HTTP transaction admission is tested concurrently;
    // SQLite's database creation path is not a distributed startup barrier.
    const left=await launch(dbPath,root,tokenA,tokenB,control);
    workers.push(left);
    const right=await launch(dbPath,root,tokenA,tokenB,control);
    workers.push(right);
    const sources=[];
    for(const worker of [left,right]){
      const anonymous=await fetch(worker.base+'/obfs/batch.mjs');
      assert.equal(anonymous.status,403);
      const authorized=await fetch(worker.base+'/obfs/batch.mjs',{
        headers:{cookie:'session='+tokenA}
      });
      assert.equal(authorized.status,200);
      const source=await authorized.text();
      assert.doesNotMatch(source,/ratchet-step-v1|createHmac|createPrivateMachine/u);
      assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));
      sources.push({sha:createHash('sha256').update(source).digest('hex'),
        bytes:Buffer.byteLength(source)});
      assert.equal((await call(worker.base,undefined,0,first)).status,403);
    }
    assert.deepEqual(sources[0],sources[1]);
    const expectedFirst=native(root,'verified-A',first,options[0]).first;
    const same=await Promise.all([
      call(left.base,tokenA,0,first),call(right.base,tokenA,0,first)
    ]);
    assert.deepEqual(same.map(row=>row.status),[200,200]);
    for(const row of same)assert.deepEqual(row.value,expectedFirst);
    assert.deepEqual(snapshot('verified-A'),{seq:2,committed:2});
    const different=await Promise.all([
      call(left.base,tokenA,2,options[0]),
      call(right.base,tokenA,2,options[1])
    ]);
    assert.deepEqual(different.map(row=>row.status).sort((a,b)=>a-b),[200,403]);
    const winning=different[0].status===200?0:1;
    const winningNative=native(root,'verified-A',first,options[winning]).next;
    assert.deepEqual(different[winning].value,winningNative);
    assert.deepEqual(snapshot('verified-A'),{seq:4,committed:4});
    const stale=await Promise.all([
      call(left.base,tokenA,0,first),call(right.base,tokenA,0,first)
    ]);
    assert.deepEqual(stale.map(row=>row.status),[403,403]);
    const retry=await call((winning===0?right:left).base,tokenA,2,options[winning]);
    assert.equal(retry.status,200);
    assert.deepEqual(retry.value,winningNative);
    assert.equal((await call(right.base,tokenA,2,options[1-winning])).status,403);
    assert.equal((await call(left.base,tokenA,4,first,[4,first,'verified-B'])).status,403);
    assert.deepEqual(snapshot('verified-A'),{seq:4,committed:4});

    const bInputs=[challenge('B',0),challenge('B',1)];
    const b=await call(left.base,tokenB,0,bInputs);
    assert.equal(b.status,200);
    assert.deepEqual(b.value,native(root,'verified-B',bInputs,[]).first);
    assert.notDeepEqual(b.value,expectedFirst);
    assert.deepEqual(snapshot('verified-B'),{seq:2,committed:2});

    await Promise.all([stop(left,control),stop(right,control)]);
    workers.length=0;
    const restarted=await launch(dbPath,root,tokenA,tokenB,control);
    workers.push(restarted);
    const recent=await call(restarted.base,tokenA,2,options[winning]);
    const old=await call(restarted.base,tokenA,0,first);
    assert.equal(recent.status,200);
    assert.deepEqual(recent.value,winningNative);
    assert.equal(old.status,403);
    assert.deepEqual(snapshot('verified-A'),{seq:4,committed:4});
    const report={
      node:process.version,platform:process.platform,sqliteExperimental:true,
      originalOutputParity:true,
      publicFacadeSources:sources,privateRootBits:256,privateWorkBytesPerEvent:8388608,
      independentHttpProcesses:2,sharedLocalDatabase:true,
      anonymousSourceStatus:403,anonymousRpcStatus:403,
      concurrentSameBatchStatuses:same.map(row=>row.status),
      concurrentDifferentBatchStatuses:different.map(row=>row.status),
      committedAEvents:4,staleStatuses:stale.map(row=>row.status),
      cachedCrossProcessStatus:retry.status,modifiedSameSequenceStatus:403,
      malformedAccountOverrideStatus:403,
      independentlyAuthenticatedBStatus:b.status,
      BCommittedEvents:2,
      gracefulRestart:{latestRetryStatus:recent.status,oldRetryStatus:old.status,
        ACommittedEvents:4},
      boundary:'Local single-host SQLite HTTP integration, no actual crash or multi-host consensus. Blocking global SQLite writer lock, online A relay, browser and 2.5x HTTP budget unmeasured.'
    };
    process.stdout.write('SCO_RATCHET_TRANSACTIONAL_HTTP '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    for(const worker of workers){
      try{await stop(worker,control);}catch{
        worker.child.kill();
      }
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,launch,stop};
