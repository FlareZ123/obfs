'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {createPrivateMachine}=require('../sims/sco-ratchet-boundary');
const {makeWorkerServer}=require('../sims/sco-ratchet-worker-http-contention');

/** @param {string} label @returns {string} */
function challenge(label){
  return createHash('sha256').update(label).digest('hex');
}

/**
 * Both worker transports use verified sessions, the same private machine and
 * the same wire argument gate. This is a negative admission control, rather
 * than an attempt to prove universal SCO security or request timing.
 *
 * @param {boolean} conventional
 * @returns {Promise<void>}
 */
async function exercise(conventional){
  const root=randomBytes(32);
  const principal=conventional?'ordinary-test':'generated-test';
  const token=randomBytes(32).toString('hex');
  const backend=makeWorkerServer(root,()=>null,conventional);
  backend.grant(token,principal);
  await backend.ready();
  const server=http.createServer(backend.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const uri='http://127.0.0.1:'+address.port+'/obfs/rpc';
  const native=createPrivateMachine(root);
  /**
   * @param {unknown} body
   * @param {string} [cookie]
   * @param {string} [mediaType]
   * @returns {Promise<{status:number,payload:{ok?:boolean,value?:string[]}}>}
   */
  async function post(body,cookie='session='+token,mediaType='application/json'){
    const response=await fetch(uri,{
      method:'POST',
      headers:{'content-type':mediaType,cookie},
      body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)
    });
    const payload=/** @type {{ok?:boolean,value?:string[]}} */ (await response.json());
    return {status:response.status,payload};
  }
  try{
    const input0=challenge('admission/0');
    const input1=challenge('admission/1');
    const input2=challenge('admission/2');
    const body0={method:'batch',args:[0,[input0]]};
    assert.equal((await post(body0,'session='+randomBytes(32).toString('hex'))).status,403);
    assert.equal((await post(body0,'session='+token,'text/plain')).status,415);
    assert.equal((await post({args:[0,[input0]]})).status,400);
    assert.equal((await post({method:'other',args:[0,[input0]]})).status,400);
    assert.equal((await post('{unparseable')).status,400);
    assert.equal((await post(Buffer.from([0x7b,0xc3,0x28,0x7d]))).status,400);
    assert.equal((await post({method:'batch',args:[1,[input0]]})).status,403);
    assert.equal(backend.calls(),0);

    const first=await post(body0);
    assert.equal(first.status,200);
    assert.equal(first.payload.ok,true);
    assert.deepEqual(first.payload.value,[native.advance(principal,0,input0)]);
    const second=await post({method:'batch',args:[1,[input1,input2]]});
    assert.equal(second.status,200);
    assert.equal(second.payload.ok,true);
    assert.deepEqual(second.payload.value,[
      native.advance(principal,1,input1),native.advance(principal,2,input2)
    ]);
    assert.equal((await post(body0)).status,403);
    assert.equal(backend.calls(),3);
  }finally{
    await backend.shutdown();
    server.closeAllConnections();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test('generated SCO worker admission and original output',async()=>{
  await exercise(false);
});

test('ordinary equal-trust worker admission and original output',async()=>{
  await exercise(true);
});
