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
