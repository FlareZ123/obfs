'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

/** @typedef {{phase:'ready'|'result'|'error',submittedNs?:string,
 * elapsedMs?:number,status?:number,output?:unknown,error?:string}} ChildReply */

/** @param {ChildReply} message @returns {void} */
function send(message){
  if(!process.send)throw TypeError('Expected child-process IPC');
  process.send(message,()=>{if(message.phase!=='ready')process.disconnect?.();});
}

/**
 * A separate legitimate Account B Node client records its monotonic
 * submission timestamp while Account A is synchronously executing private
 * engine work inside the trusted parent. The signal file is atomically
 * published by the trusted callback on A's first private operation.
 * @returns {Promise<void>}
 */
async function main(){
  const [origin,token,signalPath,batchMethod,directMethod,seedText,countText]=
    process.argv.slice(2);
  assert.ok(origin&&token&&signalPath&&batchMethod&&directMethod);
  const seed=Number(seedText),count=Number(countText);
  assert.ok(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff);
  assert.ok(Number.isInteger(count)&&count>=0&&count<=1000);
  send({phase:'ready'});
  await new Promise((resolve,reject)=>{
    const start=Date.now();
    const task=setInterval(()=>{
      if(fs.existsSync(signalPath)){
        clearInterval(task);
        resolve(undefined);
      }else if(Date.now()-start>30000){
        clearInterval(task);
        reject(new Error('No authoritative go marker from trusted parent'));
      }
    },1);
  });
  const started=process.hrtime.bigint();
  const result=await fetch(origin+'/obfs/rpc',{
    method:'POST',headers:{
      'x-batch-token':token,'content-type':'application/json'
    },
    body:JSON.stringify({method:batchMethod,args:[[
      {method:directMethod,args:[seed,count]}
    ]]})
  });
  const wire=/** @type {{ok:boolean,value:Array<{ok:boolean,value:unknown}>}} */(
    await result.json());
  assert.equal(wire.ok,true);
  assert.equal(wire.value.length,1);
  assert.equal(wire.value[0].ok,true);
  send({
    phase:'result',submittedNs:started.toString(),
    elapsedMs:Number(process.hrtime.bigint()-started)/1e6,
    status:result.status,output:wire.value[0].value
  });
}

if(require.main===module)main().catch(error=>{
  send({phase:'error',error:error instanceof Error?error.stack:String(error)});
  process.exitCode=1;
});

module.exports={main};
