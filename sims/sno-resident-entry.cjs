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
  process.stdout.write('READY\n');
  const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await (const line of lines){
    const request=/** @type {{id:number,seed:number,records:{kind:string,payload:string}[],repeat:number}} */(
      JSON.parse(line));
    let emitted=0;
    let value='';
    const cpuBefore=process.cpuUsage();
    const begin=process.hrtime.bigint();
    for(let i=0;i<request.repeat;i++){
      value=runScenario(request.seed,request.records,{emit(){emitted++;}});
    }
    const ms=Number(process.hrtime.bigint()-begin)/1e6;
    const used=process.cpuUsage(cpuBefore);
    const cpuMs=(used.user+used.system)/1000;
    const digest=createHash('sha256').update(value).digest('hex');
    process.stdout.write(JSON.stringify({id:request.id,emitted,ms,cpuMs,digest})+'\n');
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
