'use strict';

const readline=require('node:readline');
const {createHash}=require('node:crypto');

/**
 * Resident SNO performance fixture. The launcher verifies file digests and
 * imports the ESM graph before READY; measured durations cover repeated
 * application calls only. Each invocation creates fresh session state.
 */
(async()=>{
  // @ts-expect-error The verified ESM graph is materialized beside this bridge at runtime.
  const {runScenario}=await import('./entry.mjs');
  // @ts-expect-error The verified ESM graph is materialized beside this bridge at runtime.
  const {round1,round2,round3}=await import('./math.mjs');
  process.stdout.write('READY\n');
  const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await (const line of lines){
    const request=/** @type {{id:number,seed:number,records:{kind:string,payload:string}[],repeat:number,mode?:'application'|'leaves'}} */(
      JSON.parse(line));
    let emitted=0;
    let value='';
    const cpuBefore=process.cpuUsage();
    const begin=process.hrtime.bigint();
    if(request.mode==='leaves'){
      let state=request.seed|0;
      for(let i=0;i<request.repeat;i++){
        state=round1((state^i)|0);
        state=round2(state);
        state=round3(state);
      }
      value=String(state);
    }else{
      for(let i=0;i<request.repeat;i++){
        value=runScenario(request.seed,request.records,{emit(){emitted++;}});
      }
    }
    const ms=Number(process.hrtime.bigint()-begin)/1e6;
    const used=process.cpuUsage(cpuBefore);
    const cpuMs=(used.user+used.system)/1000;
    const digest=createHash('sha256').update(value).digest('hex');
    process.stdout.write(JSON.stringify({id:request.id,emitted,ms,cpuMs,digest})+'\n');
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
