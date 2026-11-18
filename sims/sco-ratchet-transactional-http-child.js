'use strict';

const http=require('node:http');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {createScoHandler,createScoRpcClientSource,createScoKeyedIsolation}=require('../src');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');

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
  const journalModeRetries=process.env.SCO_TEST_NO_JOURNAL_RETRY==='1'?0:4;
  if(!databasePath||!rootHex||!/^[a-f0-9]{64}$/u.test(rootHex)||
    !tokenA||!/^[a-f0-9]{64}$/u.test(tokenA)||
    !tokenB||!/^[a-f0-9]{64}$/u.test(tokenB)||
    !control||!/^[a-f0-9]{64}$/u.test(control)){
    throw new TypeError('Trusted test server configuration missing');
  }
  /** @type {Map<string,TransactionalRatchet>} */
  const stores=new Map();
  /**
   * A trusted, verified principal selects the local SQLite file. The public
   * RPC cannot supply a storage pathname or choose another account's shard.
   * @param {string} principal
   * @returns {TransactionalRatchet}
   */
  function storeOf(principal){
    if(accountShards&&principal!=='verified-A'&&principal!=='verified-B')
      throw new TypeError('Unverified storage principal');
    const key=accountShards?principal:'shared';
    let store=stores.get(key);
    if(store===undefined){
      const file=accountShards?path.join(databasePath,'principal-'+
        createHash('sha256').update(principal).digest('hex')+'.sqlite'):databasePath;
      store=new TransactionalRatchet(file,Buffer.from(rootHex,'hex'),
        {journalModeRetries});
      stores.set(key,store);
    }
    return store;
  }
  storeOf('verified-A');
  if(accountShards)storeOf('verified-B');
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
  // Each SQLite connection has a serial isolation key. Separate verified
  // principal shards may acquire independent SQL writer locks.
  const isolate=createScoKeyedIsolation(req=>{
    const principal=principalOf(req);
    return accountShards&&principal!==null?principal:'one-sqlite-writer';
  },{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
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
      return isolate(req,async()=>{
        const principal=principalOf(req);
        const store=storeOf(principal??'verified-A');
        store.begin();
        try{
          await contexts.run(principal,execute);
        }finally{
          store.rollback();
        }
      });
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
        const decision=storeOf(principal).batch(principal,start,inputs);
        if(decision.kind==='denied')throw new TypeError('State changed after admission');
        return decision.outputs;
      }
    }
  });

  const server=http.createServer((req,res)=>{
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
