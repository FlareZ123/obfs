'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHmac}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoHandler,createScoBatchMethod}=require('../src');

const DOMAIN_SIZE=256;

/** @typedef {{method:string,args:number[]}} OracleCall */
/** @typedef {{requests:number,operations:number,batchMilliseconds:number,serialMilliseconds:number,exactMatches:number,domainSize:number}} OracleEvidence */

/**
 * Demonstrate a bounded-input SCO oracle extraction under the prompt's
 * unlimited authorized-request attacker. A random HMAC key stays server-side,
 * yet the caller can query all 256 possible input bytes and copy the function
 * behavior into a table. The key itself remains secret and is never returned.
 *
 * @returns {Promise<OracleEvidence>}
 */
async function runOracleExhaustion() {
  const key=randomBytes(32);
  /** @param {number} input @returns {number} */
  const privateFunction=input=>{
    if(!Number.isSafeInteger(input)||input<0||input>=DOMAIN_SIZE)throw new TypeError('Invalid input');
    return createHmac('sha256',key).update(Buffer.from([input])).digest()[0];
  };
  let requests=0;
  let operations=0;
  /** @param {number} input @returns {number} */
  const sample=input=>{
    operations++;
    return privateFunction(input);
  };
  const direct={sample};
  const batch=createScoBatchMethod(direct,{maxCalls:DOMAIN_SIZE});
  /** @param {unknown} value @returns {value is OracleCall} */
  const isCall=value=>{
    if(!value||typeof value!=='object')return false;
    const call=/** @type {Partial<OracleCall>} */(value);
    return call.method==='sample' && Array.isArray(call.args) && call.args.length===1 &&
      Number.isSafeInteger(call.args[0]) && call.args[0]>=0 && call.args[0]<DOMAIN_SIZE;
  };
  const server=http.createServer(createScoHandler([
    {path:'public.mjs',sourceType:'module',code:'export const oracleAvailable=true;'}
  ],{
    remoteMethods:{sample,batch},
    authorizeRpc:request=>{
      requests++;
      return request.headers['x-session']==='legitimate';
    },
    authorizeOperation:(request,method,args)=>{
      if(request.headers['x-session']!=='legitimate')return false;
      return method==='sample' && isCall({method,args}) ||
        method==='batch' && args.length===1 && Array.isArray(args[0]) &&
          args[0].length===DOMAIN_SIZE && args[0].every(isCall);
    },
    maxRpcBytes:32768
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const endpoint='http://127.0.0.1:'+address.port+'/obfs/rpc';
    /**
     * @param {unknown} body
     * @returns {Promise<any>}
     */
    async function invoke(body) {
      const response=await fetch(endpoint,{
        method:'POST',headers:{'content-type':'application/json','x-session':'legitimate'},
        body:JSON.stringify(body)
      });
      const result=await response.json();
      assert.equal(response.status,200,JSON.stringify(result));
      assert.equal(result.ok,true,JSON.stringify(result));
      return result.value;
    }

    const enumeration=Array.from({length:DOMAIN_SIZE},(_,index)=>({
      method:'sample',args:[index]
    }));
    const batchStart=performance.now();
    const answers=await invoke({method:'batch',args:[enumeration]});
    const batchMilliseconds=performance.now()-batchStart;
    assert.equal(requests,1);
    assert.equal(operations,DOMAIN_SIZE);
    assert.equal(answers.length,DOMAIN_SIZE);

    /** @type {number[]} */
    const cloned=[];
    for(const response of answers) {
      assert.equal(response.ok,true);
      assert.equal(typeof response.value,'number');
      cloned.push(response.value);
    }
    // Independently recover the same complete lookup table via 256 simple
    // legitimate RPC requests, showing that batching changes cost, not
    // whether the server-only function can be cloned on this finite domain.
    const serialStart=performance.now();
    /** @type {number[]} */
    const serial=[];
    for(let i=0;i<DOMAIN_SIZE;i++)serial.push(await invoke({method:'sample',args:[i]}));
    const serialMilliseconds=performance.now()-serialStart;
    assert.deepEqual(cloned,serial);
    let exactMatches=0;
    for(let i=0;i<DOMAIN_SIZE;i++) {
      if(cloned[i]===privateFunction(i))exactMatches++;
    }
    assert.equal(exactMatches,DOMAIN_SIZE);
    assert.equal(requests,DOMAIN_SIZE+1);
    assert.equal(operations,DOMAIN_SIZE*2);
    return {requests,operations,batchMilliseconds,serialMilliseconds,
      exactMatches,domainSize:DOMAIN_SIZE};
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module) {
  runOracleExhaustion().then(evidence=>{
    process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
  }).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={runOracleExhaustion};
