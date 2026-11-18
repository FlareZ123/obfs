'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

/** @typedef {{phase:'ready'|'result'|'error',
 * submittedNs?:string,elapsedMs?:number,status?:number,
 * outputs?:string[],error?:string}} ChildReply */

/** @param {ChildReply} message @returns {void} */
function send(message){
  assert.equal(typeof process.send,'function');
  process.send(message,()=>{if(message.phase!=='ready')process.disconnect?.();});
}

/** @returns {Promise<void>} */
async function submit(){
  const base=process.argv[2],token=process.argv[3],
    signalPath=process.argv[4],raw=process.argv[5];
  assert.ok(base&&token&&signalPath&&raw);
  const inputs=/** @type {string[]} */(JSON.parse(raw));
  assert.equal(inputs.length,16);
  send({phase:'ready'});
  // Independent Node child can submit a B HTTP request while the trusted
  // main server event loop executes A's synchronous HMAC on another process.
  // The single parent synchronously renames a tiny signal file only when
  // its private A batch has entered, before performing any HMAC work.
  await new Promise((resolve,reject)=>{
    const started=Date.now();
    const poll=setInterval(()=>{
      if(fs.existsSync(signalPath)){
        clearInterval(poll);
        resolve(undefined);
      }else if(Date.now()-started>30000){
        clearInterval(poll);
        reject(new Error('Attacker A did not enter its private batch'));
      }
    },1);
  });
  const began=process.hrtime.bigint();
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',cookie:'session='+token},
    body:JSON.stringify({method:'batch',args:[0,inputs]})
  });
  const payload=/** @type {{ok?:boolean,value?:string[]}} */(await response.json());
  send({
    phase:'result',submittedNs:began.toString(),
    elapsedMs:Number(process.hrtime.bigint()-began)/1e6,
    status:response.status,outputs:payload.value
  });
}

submit().catch(error=>{
  send({phase:'error',error:error instanceof Error?error.stack:String(error)});
  process.exitCode=1;
});
