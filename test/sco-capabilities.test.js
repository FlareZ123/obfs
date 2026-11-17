'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScoCapabilityScope,createScoPrivateHandles}=require('../src/sco-capabilities');
const {setTimeout:delay}=require('node:timers/promises');

/** @param {string} account @returns {import('node:http').IncomingMessage} */
function request(account){return /** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ ({account}));}

/** @param {import('node:http').IncomingMessage} request @returns {string} */
function verifiedAccount(request){return /** @type {{account:string}} */ (/** @type {unknown} */ (request)).account;}

test('unexported state is available only to the authenticated principal',async()=>{
 const scope=createScoCapabilityScope(verifiedAccount);
 const store=createScoPrivateHandles(scope.currentPrincipal);
 let handle='';
 await scope.runRpcIsolated(request('alice'),async()=>{
  handle=store.issue({secret:'server-only-key',count:2});
  assert.equal(handle.length,43);
  assert.equal(store.use(handle,value=>/** @type {{count:number}} */(value).count),2);
 });
 await scope.runRpcIsolated(request('bob'),async()=>{
  assert.throws(()=>store.use(handle,value=>value),/Invalid private SCO capability/);
  assert.equal(store.revoke(handle),false);
 });
 await scope.runRpcIsolated(request('alice'),async()=>{
  assert.equal(store.use(handle,value=>/** @type {{secret:string}} */(value).secret),'server-only-key');
  assert.equal(store.revoke(handle),true);
  assert.throws(()=>store.use(handle,value=>value),/Invalid private SCO capability/);
 });
 assert.throws(()=>scope.currentPrincipal(),/active authenticated RPC scope/);
});

test('detached async work cannot reuse a completed request scope',async()=>{
 const scope=createScoCapabilityScope(verifiedAccount);
 const store=createScoPrivateHandles(scope.currentPrincipal);
 /** @type {Promise<string>|undefined} */let later;
 await scope.runRpcIsolated(request('alice'),async()=>{
  later=delay(20).then(()=>{
   try{store.issue('detached');return 'unexpected-access'}
   catch(error){return /** @type {Error} */(error).message}
  });
 });
 assert.match(await /** @type {Promise<string>} */ (later),/active authenticated RPC scope/);
});

test('expiration and bounded per-principal quotas preserve isolation',async()=>{
 const scope=createScoCapabilityScope(verifiedAccount);
 const store=createScoPrivateHandles(scope.currentPrincipal,{ttlMs:10,maxHandles:2,maxHandlesPerPrincipal:1});
 let old='';let newer='';
 await scope.runRpcIsolated(request('alice'),async()=>{
  old=store.issue('first');
  assert.throws(()=>store.issue('second'),/capacity reached/);
 });
 await scope.runRpcIsolated(request('bob'),async()=>{newer=store.issue('second');});
 await delay(20);
 await scope.runRpcIsolated(request('alice'),async()=>{
  assert.throws(()=>store.use(old,value=>value),/Invalid private SCO capability/);
  const fresh=store.issue('third');
  assert.notEqual(fresh,old);
  assert.equal(store.use(fresh,value=>value),'third');
 });
 await scope.runRpcIsolated(request('bob'),async()=>assert.throws(()=>store.use(newer,value=>value),/Invalid private SCO capability/));
});

test('invalid identity, invalid options and malformed handles fail closed',async()=>{
 assert.throws(()=>createScoCapabilityScope(/** @type {any} */ (null)),/principalOf/);
 assert.throws(()=>createScoPrivateHandles(()=> 'alice',{maxHandles:0}),/limits/);
 const scope=createScoCapabilityScope(()=> '');
 await assert.rejects(scope.runRpcIsolated(request('any'),async()=>{}),/Authenticated principal must be a nonempty string/);
 const safe=createScoCapabilityScope(verifiedAccount);
 const store=createScoPrivateHandles(safe.currentPrincipal);
 await safe.runRpcIsolated(request('alice'),async()=>{
  assert.throws(()=>store.use('abc',value=>value),/Invalid private SCO capability/);
 });
});


test('concurrent principals retain separate asynchronous contexts and same-principal FIFO',async()=>{
 const scope=createScoCapabilityScope(verifiedAccount);
 /** @type {()=>void} */let release=()=>{};
 /** @type {()=>void} */let entered=()=>{};
 const hold=new Promise(resolve=>{release=()=>resolve(undefined);});
 const started=new Promise(resolve=>{entered=()=>resolve(undefined);});
 /** @type {string[]} */const trace=[];
 const first=scope.runRpcIsolated(request('alice'),async()=>{
  trace.push('alice-first:'+scope.currentPrincipal());
  entered();
  await hold;
  trace.push('alice-after-await:'+scope.currentPrincipal());
 });
 await started;
 const second=scope.runRpcIsolated(request('alice'),async()=>{
  trace.push('alice-second:'+scope.currentPrincipal());
 });
 await scope.runRpcIsolated(request('bob'),async()=>{
  trace.push('bob:'+scope.currentPrincipal());
  await Promise.resolve();
  trace.push('bob-after-await:'+scope.currentPrincipal());
 });
 assert.deepEqual(trace,['alice-first:alice','bob:bob','bob-after-await:bob']);
 release();
 await Promise.all([first,second]);
 assert.deepEqual(trace,[
  'alice-first:alice','bob:bob','bob-after-await:bob',
  'alice-after-await:alice','alice-second:alice'
 ]);
 assert.throws(()=>scope.currentPrincipal(),/active authenticated RPC scope/);
});

test('rejected resolver cannot reuse an old scope on a repeated request object',async()=>{
 let valid=true;
 const req=request('alice');
 const scope=createScoCapabilityScope(()=>valid?'alice':'');
 await scope.runRpcIsolated(req,async()=>{
  assert.equal(scope.currentPrincipal(),'alice');
 });
 valid=false;
 await assert.rejects(scope.runRpcIsolated(req,async()=>{
  throw Error('must not enter');
 }),/Authenticated principal/);
 assert.throws(()=>scope.currentPrincipal(),/active authenticated RPC scope/);
});

test('concurrent reuse of one request object cannot replace a queued principal',async()=>{
  const reused=request('shared');
  let decisions=0;
  const scope=createScoCapabilityScope(req=>
    req===reused?(++decisions===1?'alice':'bob'):verifiedAccount(req));
  /** @type {()=>void} */
  let release=()=>{};
  /** @type {()=>void} */
  let entered=()=>{};
  const hold=new Promise(resolve=>{release=()=>resolve(undefined);});
  const started=new Promise(resolve=>{entered=()=>resolve(undefined);});
  const blocked=scope.runRpcIsolated(request('alice'),async()=>{
    entered();
    await hold;
  });
  await started;
  /** @type {string[]} */
  const seen=[];
  const alice=scope.runRpcIsolated(reused,async()=>{
    seen.push('first:'+scope.currentPrincipal());
  });
  const bob=scope.runRpcIsolated(reused,async()=>{
    seen.push('second:'+scope.currentPrincipal());
  });
  try {
    await bob;
    assert.deepEqual(seen,['second:bob']);
  }finally{
    release();
  }
  await Promise.all([blocked,alice]);
  assert.deepEqual(seen,['second:bob','first:alice']);
  assert.equal(decisions,2);
});
