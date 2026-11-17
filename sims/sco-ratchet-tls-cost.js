'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const https=require('node:https');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeServer}=require('./sco-ratchet-batch-candidate');

// The fixture is deliberately public and test-only. TLS authenticates the
// loopback test endpoint; this is not a production certificate.
const certificate=fs.readFileSync(path.join(__dirname,'fixtures','localhost-cert.pem'));
const tlsKey=fs.readFileSync(path.join(__dirname,'fixtures','localhost-key.pem'));

/** @typedef {{status:number,body:string}} RawReply */
/** @typedef {{status:number,value?:string[]}} BatchReply */

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const ordered=[...numbers].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Certificate-validated HTTPS RPC through the actual SCO handler. A supplied
 * https.Agent distinguishes connection reuse from fresh TLS handshakes.
 * @param {number} port
 * @param {https.Agent} agent
 * @param {string} method
 * @param {string|undefined} token
 * @param {string} pathname
 * @param {unknown[]|undefined} args
 * @returns {Promise<RawReply>}
 */
function request(port,agent,method,token,pathname,args){
  const body=args===undefined?undefined:JSON.stringify({method,args});
  return new Promise((resolve,reject)=>{
    const client=https.request({
      hostname:'localhost',port,path:pathname,agent,method:body===undefined?'GET':'POST',
      headers:{
        ...(body===undefined?{}:{'content-type':'application/json',
          'content-length':Buffer.byteLength(body)}),
        ...(token?{cookie:'session='+token}:{})
      }
    },response=>{
      /** @type {Buffer[]} */
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('error',reject);
      response.on('end',()=>resolve({
        status:response.statusCode??500,
        body:Buffer.concat(chunks).toString('utf8')
      }));
    });
    client.on('error',reject);
    client.end(body);
  });
}

/**
 * @param {number} port
 * @param {https.Agent} agent
 * @param {string|undefined} token
 * @param {number} seq
 * @param {string[]} inputs
 * @returns {Promise<BatchReply>}
 */
async function step(port,agent,token,seq,inputs){
  const response=await request(port,agent,'batch',token,'/obfs/rpc',[seq,inputs]);
  const payload=/** @type {{ok?:boolean,value?:string[]}} */(JSON.parse(response.body));
  return {status:response.status,value:payload.value};
}

/**
 * @param {Buffer} rootKey
 * @param {number} delayMs
 * @returns {Promise<object>}
 */
async function profile(rootKey,delayMs){
  const backend=makeServer(rootKey,delayMs);
  const server=https.createServer({cert:certificate,key:tlsKey,minVersion:'TLSv1.3'},backend.handler);
  let secureConnections=0;
  server.on('secureConnection',()=>{secureConnections++;});
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'localhost',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const port=address.port;
  const warmed=new https.Agent({ca:certificate,keepAlive:true,maxSockets:1,minVersion:'TLSv1.3'});
  const fresh=new https.Agent({ca:certificate,keepAlive:false,maxSockets:1,
    maxCachedSessions:0,minVersion:'TLSv1.3'});
  try{
    const denied=await request(port,warmed,'ignored',undefined,'/obfs/batch.mjs',undefined);
    assert.equal(denied.status,403);
    // This is a negative control: the same self-signed fixture is not
    // trusted by an HTTPS client without the test CA.
    await assert.rejects(
      request(port,new https.Agent({keepAlive:false,maxCachedSessions:0}), 'batch',
        undefined,'/obfs/batch.mjs',undefined),
      error=>/** @type {NodeJS.ErrnoException} */(error).code==='DEPTH_ZERO_SELF_SIGNED_CERT'
    );
    const tokenSource=randomBytes(32).toString('hex');
    backend.grant(tokenSource,'source-reader');
    const published=await request(port,warmed,'ignored',tokenSource,'/obfs/batch.mjs',undefined);
    assert.equal(published.status,200);
    assert.doesNotMatch(published.body,/createPrivateMachine|ratchet-step-v1|createHmac/u);
    assert.doesNotMatch(published.body,new RegExp(rootKey.toString('hex'),'u'));
    const publicSha256=createHash('sha256').update(published.body).digest('hex');
    // Warm the TLS connection and the actual SCO policy/crypto path.
    const warmToken=randomBytes(32).toString('hex');
    backend.grant(warmToken,'warm');
    const warmInputs=[challenge(0),challenge(1)];
    assert.equal((await step(port,warmed,warmToken,0,warmInputs)).status,200);

    /** @type {Array<{count:number,connection:'warm'|'fresh',
     *  nativeMs:number,remoteMs:number,ratio:number}>} */
    const pairs=[];
    for(const count of [1,4,16,64]){
      for(let trial=0;trial<7;trial++){
        const order=trial%2===0?/** @type {const} */(['warm','fresh']):
          /** @type {const} */(['fresh','warm']);
        for(const connection of order){
          const principal=['tls',delayMs,count,trial,connection].join('-');
          const token=randomBytes(32).toString('hex');
          backend.grant(token,principal);
          const local=createPrivateMachine(rootKey);
          const inputs=Array.from({length:count},(_,index)=>challenge(index));
          /** @type {string[]} */
          let expected=[];
          /** @type {string[]|undefined} */
          let observed;
          const localTime=()=>{
            const started=performance.now();
            expected=inputs.map((value,index)=>{
              const item=local.advance(principal,index,value);
              assert.equal(typeof item,'string');
              return /** @type {string} */(item);
            });
            return performance.now()-started;
          };
          const remoteTime=async()=>{
            const started=performance.now();
            const reply=await step(port,connection==='warm'?warmed:fresh,token,0,inputs);
            assert.equal(reply.status,200);
            observed=reply.value;
            return performance.now()-started;
          };
          let nativeMs,remoteMs;
          if(trial%2===0){nativeMs=localTime();remoteMs=await remoteTime();}
          else{remoteMs=await remoteTime();nativeMs=localTime();}
          assert.deepEqual(observed,expected);
          pairs.push({count,connection,nativeMs,remoteMs,ratio:remoteMs/nativeMs});
        }
      }
    }
    const results=[1,4,16,64].flatMap(count=>
      (/** @type {const} */(['warm','fresh'])).map(connection=>{
        const selected=pairs.filter(row=>row.count===count&&row.connection===connection);
        return {count,connection,trials:selected.length,
          medianRatio:median(selected.map(row=>row.ratio)),
          maximumRatio:Math.max(...selected.map(row=>row.ratio)),
          strictOverBudgetPairs:selected.filter(row=>row.ratio>2.5).length,
          ratios:selected.map(row=>Number(row.ratio.toFixed(5)))};
      }));
    return {
      platform:process.platform,node:process.version,delayMs,
      publicSha256,publicBytes:Buffer.byteLength(published.body),
      tlsVersion:'TLSv1.3',certificateValidated:true,
      certificateRefusalConfirmed:true,privateWorkBytesPerEvent:8388608,
      secureConnections,results,
      supportedBatchesPass:results.filter(row=>row.count>=16)
        .every(row=>row.strictOverBudgetPairs===0),
      oneEventPass:results.filter(row=>row.count===1)
        .every(row=>row.strictOverBudgetPairs===0)
    };
  }finally{
    warmed.destroy();
    fresh.destroy();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const rootKey=randomBytes(32);
  return {
    candidate:'Certificate-validated TLS 1.3 per-account SCO atomic ratchet',
    scenarios:[await profile(rootKey,0),await profile(rootKey,25)],
    caveat:'Localhost self-signed test certificate, artificial 25ms server delay, Node-only HTTPS. No production RTT/TLS certificate chain or browser timing.'
  };
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_RATCHET_TLS_RESULT '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment};
