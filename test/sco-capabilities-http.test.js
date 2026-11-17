'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoCapabilityScope,createScoPrivateHandles}=require('../src');

/** @param {number} port @param {string} session @param {string} method @param {unknown[]} args @returns {Promise<{status:number,body:any}>} */
async function rpc(port,session,method,args){
 const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
  method:'POST',headers:{'content-type':'application/json','x-test-session':session},
  body:JSON.stringify({method,args})
 });
 return {status:response.status,body:await response.json()};
}

test('real SCO HTTP handler keeps opaque server values principal-scoped',{
 timeout:15000
},async()=>{
 const sessions=new Map([['fixture-credential-A','alice'],['fixture-credential-B','bob']]);
 /** @param {import('node:http').IncomingMessage} request @returns {string|undefined} */
 const sessionPrincipal=request=>sessions.get(String(request.headers['x-test-session']??''));
 const scope=createScoCapabilityScope(request=>sessionPrincipal(request)??'unverified',{
  maxPendingPerPrincipal:8,maxPendingTotal:32
 });
 const store=createScoPrivateHandles(scope.currentPrincipal,{ttlMs:60000,maxHandles:8,maxHandlesPerPrincipal:4});
 let issued=0;
 let privateReads=0;
 const server=http.createServer(createScoHandler([] ,{
  remoteMethods:{
   issue:()=>{issued++;return store.issue({value:41,internal:'never-public'});},
   publicValue:/** @param {string} token */ token=>store.use(token,value=>{
    privateReads++;return /** @type {{value:number}} */ (value).value;
   }),
   revoke:/** @param {string} token */ token=>store.revoke(token)
  },
  authorizeRpc:request=>sessionPrincipal(request)!==undefined,
  authorizeOperation:(request,method,args)=>sessionPrincipal(request)!==undefined&&
   (method==='issue'?args.length===0:(method==='publicValue'||method==='revoke')&&
    args.length===1&&typeof args[0]==='string'),
  runRpcIsolated:scope.runRpcIsolated
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP listener');
  const port=address.port;
  const denied=await rpc(port,'forged','issue',[]);
  assert.equal(denied.status,403);
  assert.equal(issued,0);
  const created=await rpc(port,'fixture-credential-A','issue',[]);
  assert.equal(created.status,200);
  const token=/** @type {string} */ (created.body.value);
  assert.match(token,/^[A-Za-z0-9_-]{43}$/u);
  assert.equal(JSON.stringify(created).includes('never-public'),false);
  const replayedAcrossAccounts=await rpc(port,'fixture-credential-B','publicValue',[token]);
  assert.deepEqual(replayedAcrossAccounts,{status:500,body:{ok:false,error:'Operation failed'}});
  assert.equal(privateReads,0);
  assert.deepEqual(await rpc(port,'fixture-credential-A','publicValue',[token]),{
   status:200,body:{ok:true,value:41}
  });
  assert.equal(privateReads,1);
  // Attacker-operated same-account relay is permitted under the stated threat model.
  assert.deepEqual(await rpc(port,'fixture-credential-A','publicValue',[token]),{
   status:200,body:{ok:true,value:41}
  });
  assert.equal(privateReads,2);
  assert.deepEqual(await rpc(port,'fixture-credential-A','revoke',[token]),{
   status:200,body:{ok:true,value:true}
  });
  assert.equal((await rpc(port,'fixture-credential-A','publicValue',[token])).status,500);
  assert.equal(privateReads,2);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
 }
});
