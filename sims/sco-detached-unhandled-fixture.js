'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/** @returns {Promise<void>} */
async function main(){
  let privateStarts=0;
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{privateWork:()=>{privateStarts++;return 'sensitive';}},
    authorizeRpc:async()=>{
      await new Promise(resolve=>setImmediate(resolve));
      return true;
    },
    // Deliberately faulty integrator: invoke execute but discard its promise.
    // An obfuscator's trusted server still must not crash due to the late
    // rejection after the HTTP handler returns its generic 500 response.
    runRpcIsolated:async(_request,execute)=>{
      void execute();
    }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing RPC listener');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'privateWork',args:[]})
    });
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{ok:false,error:'Operation failed'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(privateStarts,0);
    process.stdout.write('PASS detached SCO promise ignored without fatal unhandled rejection\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
