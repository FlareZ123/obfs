'use strict';

const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {createScoHandler,createScoRpcClientSource,createScoKeyedIsolation}=require('../src');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {bucketOf}=require('./sco-ratchet-bucket-keys');

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */

/**
 * One genuine trusted HTTP process. Its root, A/B session tokens and shared
 * database path are injected by the controlled test harness and are never
 * emitted as public source. No entitlement is derived from a Host header.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const databasePath=process.env.SCO_TEST_DB;
  const rootHex=process.env.SCO_TEST_ROOT;
  const tokenA=process.env.SCO_TEST_TOKEN_A;
  const tokenB=process.env.SCO_TEST_TOKEN_B;
  const control=process.env.SCO_TEST_CONTROL;
  const legacyAnonymousLock=process.env.SCO_TEST_LEGACY_UNAUTH_LOCK==='1';
  const accountShards=process.env.SCO_TEST_ACCOUNT_SHARDS==='1';
  const bucketCount=Number(process.env.SCO_TEST_ACCOUNT_BUCKETS??'0');
  if(accountShards&&bucketCount!==0)throw new TypeError('Choose one trusted shard topology');
  if(bucketCount!==0&&(!Number.isSafeInteger(bucketCount)||bucketCount<1||
    bucketCount>256||(bucketCount&(bucketCount-1))!==0))
    throw new TypeError('Trusted bucket count must be a power of two');
  const privateAMarker=process.env.SCO_TEST_A_WORK_MARKER;
  const nestedAccountQuota=process.env.SCO_TEST_NESTED_ACCOUNT_QUOTA==='1';
  const earlyAGate=process.env.SCO_TEST_EARLY_A_GATE==='1';
  const firstAGateMs=Number(process.env.SCO_TEST_FIRST_A_GATE_MS??'0');
  if(!Number.isSafeInteger(firstAGateMs)||firstAGateMs<0||firstAGateMs>5000)
    throw new TypeError('Trusted test delay must be an integer from 0 to 5000');
  const journalModeRetries=process.env.SCO_TEST_NO_JOURNAL_RETRY==='1'?0:4;
  if(!databasePath||!rootHex||!/^[a-f0-9]{64}$/u.test(rootHex)||
    !tokenA||!/^[a-f0-9]{64}$/u.test(tokenA)||
    !tokenB||!/^[a-f0-9]{64}$/u.test(tokenB)||
    !control||!/^[a-f0-9]{64}$/u.test(control)){
    throw new TypeError('Trusted test server configuration missing');
  }
  const trustedPath=databasePath;
  const trustedRoot=Buffer.from(rootHex,'hex');
  /** @type {Map<string,TransactionalRatchet>} */
  const stores=new Map();
  /**
   * A trusted, verified principal selects a stable local storage key. Public
   * RPC arguments cannot supply a pathname or impersonate another account.
   * @param {string} principal
   * @returns {string}
   */
  function storageKey(principal){
    if(principal!=='verified-A'&&principal!=='verified-B')
      throw new TypeError('Unverified storage principal');
    if(bucketCount>0)return 'bucket-'+bucketOf(trustedRoot,principal,bucketCount);
    return accountShards?principal:'shared';
  }
  /**
   * @param {string} key
   * @returns {TransactionalRatchet}
   */
  function openKey(key){
    let store=stores.get(key);
    if(store===undefined){
      const file=bucketCount>0?path.join(trustedPath,key+'.sqlite'):
        accountShards?path.join(trustedPath,'principal-'+
          createHash('sha256').update(key).digest('hex')+'.sqlite'):trustedPath;
      store=new TransactionalRatchet(file,trustedRoot,{journalModeRetries});
      stores.set(key,store);
    }
    return store;
  }
  /** @param {string} principal @returns {TransactionalRatchet} */
  function storeOf(principal){
    return openKey(storageKey(principal));
  }
  if(bucketCount>0){
    // Fixed-capacity topology initializes its full DB set before admission.
    for(let index=0;index<bucketCount;index++)openKey('bucket-'+index);
  }else{
    storeOf('verified-A');
    if(accountShards)storeOf('verified-B');
  }
  /** @returns {void} */
  function closeStores(){
    for(const store of stores.values())store.close();
    stores.clear();
  }
  const contexts=new AsyncLocalStorage();
  /** @param {IncomingMessage} req @returns {string|null} */
  function principalOf(req){
    const cookie=req.headers.cookie;
    if(cookie==='session='+tokenA)return 'verified-A';
    if(cookie==='session='+tokenB)return 'verified-B';
    return null;
  }
  let recordedAAdmissions=0;
  let firstAGateApplied=false;
  /**
   * The original branch charges capacity to a SQLite writer's bucket key.
   * When two authenticated principals share a bucket, the quota is shared.
   * The corrected branch charges the quota to the actual verified principal
   * and separately serializes the corresponding SQLite writer.
   */
  const bucketKey=/** @param {IncomingMessage} req */(req)=>{
    const principal=principalOf(req);
    return principal===null?'one-sqlite-writer':
      accountShards||bucketCount>0?storageKey(principal):'one-sqlite-writer';
  };
  const isolate=createScoKeyedIsolation(req=>{
    if(principalOf(req)==='verified-A')recordedAAdmissions++;
    return bucketKey(req);
  },{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const perPrincipalIsolate=createScoKeyedIsolation(req=>{
    const principal=principalOf(req);
    if(principal==='verified-A')recordedAAdmissions++;
    return principal??'unauthenticated';
  },{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const perWriterIsolate=createScoKeyedIsolation(bucketKey);
  const generated=createScoRpcClientSource(['batch']);
  const handler=createScoHandler([{
    path:'batch.mjs',sourceType:'module',code:generated
  }],{
    publicPaths:['batch.mjs'],
    authorizeRead:req=>principalOf(req)!==null,
    authorizeRpc:req=>principalOf(req)!==null,
    authorizeOperation:(req,method,args)=>{
      const principal=principalOf(req);
      if(principal===null||method!=='batch'||args.length!==2||
         !Number.isSafeInteger(args[0])||!Array.isArray(args[1]))return false;
      return storeOf(principal).admissible(principal,
        /** @type {number} */(args[0]),
        /** @type {string[]} */(args[1]));
    },
    runRpcIsolated:(req,execute)=>{
      // A request without the verified test cookie must still pass through
      // the core authorizeRpc check, but must never acquire a SQLite writer
      // transaction merely to receive its expected 403 denial. The legacy
      // mode reproduces the old global-lock path for a matched experiment.
      if(!legacyAnonymousLock&&principalOf(req)===null)return execute();
      /**
       * Trust-only preparation is explicitly state-independent. Regardless
       * of placement, the actual authorization checks, state admission and
       * private work remain within the writer transaction scope.
       * @returns {Promise<void>}
       */
      const gate=async()=>{
        if(principalOf(req)==='verified-A'&&firstAGateMs>0&&!firstAGateApplied){
          firstAGateApplied=true;
          await new Promise(resolve=>setTimeout(resolve,firstAGateMs));
        }
      };
      const worker=async()=>{
        const principal=principalOf(req);
        if(!earlyAGate)await gate();
        const store=storeOf(principal??'verified-A');
        store.begin();
        try{
          await contexts.run(principal,execute);
        }finally{
          store.rollback();
        }
      };
      return nestedAccountQuota?
        perPrincipalIsolate(req,async()=>{
          if(earlyAGate)await gate();
          return perWriterIsolate(req,worker);
        }):
        isolate(req,worker);
    },
    remoteMethods:{
      /**
       * @param {number} start
       * @param {string[]} inputs
       * @returns {string[]}
       */
      batch:(start,inputs)=>{
        const principal=contexts.getStore();
        if(typeof principal!=='string')throw new TypeError('Missing trusted account');
        // Trusted test-only marker: record the exact entry to long A work
        // for a separate independent B latency experiment. No RPC argument
        // can select this path or cause a B marker.
        if(privateAMarker&&principal==='verified-A'&&inputs.length===64){
          fs.writeFileSync(privateAMarker+'.new',String(process.hrtime.bigint()));
          fs.renameSync(privateAMarker+'.new',privateAMarker);
        }
        const decision=storeOf(principal).batch(principal,start,inputs);
        if(decision.kind==='denied')throw new TypeError('State changed after admission');
        return decision.outputs;
      }
    }
  });

  const server=http.createServer((req,res)=>{
    if(req.url==='/__test__/admissions'&&req.method==='GET'&&
       req.headers['x-test-control']===control){
      res.writeHead(200,{'content-type':'application/json'})
        .end(JSON.stringify({recordedAAdmissions}));
      return;
    }
    if(req.url==='/__test__/hold'&&req.method==='POST'&&
       req.headers['x-test-control']===control){
      // Trusted test-only lock-control route, never part of public SCO API.
      const store=storeOf('verified-A');
      store.begin();
      res.writeHead(200,{'cache-control':'no-store'}).end('HELD');
      setTimeout(()=>store.rollback(),1500);
      return;
    }
    if(req.url==='/__test__/stop'&&req.method==='POST'&&
       req.headers['x-test-control']===control){
      res.writeHead(204).end();
      server.close(()=>closeStores());
      return;
    }
    handler(req,res);
  });
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw new TypeError('Missing HTTP address');
  process.stdout.write(JSON.stringify({ready:true,port:address.port})+'\n');
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
