'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {createScoHandler}=require('../src');

/**
 * The remote host header is a field supplied by the requester, not a trusted
 * record of where the script will execute. The live TCP destination here is
 * always 127.0.0.1; the attacker chooses the independent HTTP Host value.
 *
 * @param {number} port
 * @param {string} host
 * @param {string} [session]
 * @param {boolean} [rpc]
 * @returns {Promise<{status:number,body:string}>}
 */
function request(port,host,session='',rpc=false) {
  return new Promise((resolve,reject)=>{
    const method=rpc?'POST':'GET';
    const outgoing=http.request({
      hostname:'127.0.0.1',port,
      path:rpc?'/obfs/rpc':'/obfs/client.js',
      method,headers:{
        host,
        'x-session':session,
        'content-type':'application/json'
      }
    },response=>{
      /** @type {Buffer[]} */
      const buffers=[];
      response.on('data',part=>buffers.push(Buffer.from(part)));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:Buffer.concat(buffers).toString('utf8')
      }));
      response.on('error',reject);
    });
    outgoing.on('error',reject);
    outgoing.end(rpc?JSON.stringify({method:'operation',args:[]}):undefined);
  });
}

/** @param {http.RequestListener} listener @returns {Promise<{server:http.Server,port:number}>} */
async function listen(listener) {
  const server=http.createServer(listener);
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  await ready;
  const address=server.address();
  assert.ok(address && typeof address==='object');
  return {server,port:address.port};
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

test('SCO Host filter alone can be satisfied by a requester-controlled Host field',async()=>{
  const {server,port}=await listen(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.publicValue=47;'}
  ],{allowedHosts:['legitimate.example']}));
  try {
    const badHost=await request(port,'unrelated.example');
    assert.equal(badHost.status,403);
    const forgedHost=await request(port,'legitimate.example');
    assert.equal(forgedHost.status,200);
    assert.match(forgedHost.body,/publicValue/u);
  } finally {await close(server);}
});

test('SCO read and operation authorization must protect content despite forged Host',async()=>{
  const {server,port}=await listen(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.publicValue=47;'}
  ],{
    allowedHosts:['legitimate.example'],
    authorizeRead:req=>req.headers['x-session']==='authorized',
    remoteMethods:{operation:()=>59},
    authorizeRpc:req=>req.headers['x-session']==='authorized',
    authorizeOperation:(req,method,args)=>req.headers['x-session']==='authorized' &&
      method==='operation' && args.length===0
  }));
  try {
    const forgedRead=await request(port,'legitimate.example');
    const forgedRpc=await request(port,'legitimate.example','',true);
    assert.equal(forgedRead.status,403);
    assert.equal(forgedRpc.status,403);
    const authenticatedRead=await request(port,'legitimate.example','authorized');
    const authenticatedRpc=await request(port,'legitimate.example','authorized',true);
    assert.equal(authenticatedRead.status,200);
    assert.match(authenticatedRead.body,/publicValue/u);
    assert.equal(authenticatedRpc.status,200);
    assert.deepEqual(JSON.parse(authenticatedRpc.body),{ok:true,value:59});
  } finally {await close(server);}
});
