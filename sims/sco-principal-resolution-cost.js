'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createScoKeyedIsolation}=require('../src/rpc-keyed-isolation');

/** @typedef {{cpuMs:number,wallMs:number,effects:number}} Sample */
/** @typedef {{cpu:number|null,wall:number}} Pair */
/** @param {number[]} values @returns {number} */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Measure the additional opt-in lookup deadline against the same SCO
 * per-principal isolation baseline. This is not a native application versus
 * full compiler measurement. The timer is part of request-time work.
 *
 * @param {'sync'|'async'} resolverKind
 * @param {number} workBytes
 * @param {number} iterations
 * @param {number} trials
 * @param {boolean} [abortPrincipalLookup]
 * @returns {Promise<{resolverKind:string,abortPrincipalLookup:boolean,workBytes:number,iterations:number,
 *   trials:number,pairs:Pair[],strictCpuBreaches:number,strictWallBreaches:number,
 *   unresolvedCpuPairs:number,medianCpuRatio:number|null,medianWallRatio:number}>}
 */
async function experiment(resolverKind,workBytes,iterations=10000,trials=7,abortPrincipalLookup=false){
  const resolvePrincipal=resolverKind==='sync'?
    ()=> 'verified' : async()=> 'verified';
  const baseline=createScoKeyedIsolation(resolvePrincipal,{maxPendingTotal:2});
  const deadline=createScoKeyedIsolation(resolvePrincipal,{
    maxPendingTotal:2,maxPrincipalResolutionMs:10000,abortPrincipalLookup
  });
  const request=/** @type {import('node:http').IncomingMessage} */ (
    /** @type {unknown} */ ({}));
  const payload=Buffer.alloc(workBytes,71);
  let effects=0;
  /**
   * @param {(request:import('node:http').IncomingMessage,
   *    execute:()=>Promise<void>)=>Promise<void>} isolate
   * @param {number} count
   * @returns {Promise<Sample>}
   */
  async function run(isolate,count){
    const usage=process.cpuUsage();
    const started=process.hrtime.bigint();
    const initial=effects;
    for(let index=0;index<count;index++){
      await isolate(request,async()=>{
        if(workBytes){
          const digest=createHash('sha256').update(payload).digest();
          effects+=digest[0]===255?2:1;
        }else{
          effects++;
        }
      });
    }
    const delta=process.cpuUsage(usage);
    const wallMs=Number(process.hrtime.bigint()-started)/1e6;
    return {cpuMs:(delta.user+delta.system)/1000,
      wallMs,effects:effects-initial};
  }
  await run(baseline,1000);
  await run(deadline,1000);
  /** @type {Pair[]} */
  const pairs=[];
  for(let trial=0;trial<trials;trial++){
    /** @type {Sample} */
    let direct;
    /** @type {Sample} */
    let guarded;
    if(trial%2===0){
      direct=await run(baseline,iterations);
      guarded=await run(deadline,iterations);
    }else{
      guarded=await run(deadline,iterations);
      direct=await run(baseline,iterations);
    }
    assert.equal(direct.effects,guarded.effects,'Protected method effects must match');
    assert.ok(direct.wallMs>0&&guarded.wallMs>0);
    // Windows process.cpuUsage can quantize a short session to zero ticks.
    // Retain that pair as unresolved rather than divide by zero or invent CPU.
    const cpu=direct.cpuMs>0&&guarded.cpuMs>0?
      guarded.cpuMs/direct.cpuMs:null;
    pairs.push({cpu,wall:guarded.wallMs/direct.wallMs});
  }
  const resolvedCpu=pairs.flatMap(x=>x.cpu===null?[]:[x.cpu]);
  return {resolverKind,abortPrincipalLookup,workBytes,iterations,trials,pairs,
    strictCpuBreaches:resolvedCpu.filter(value=>value>2.5).length,
    strictWallBreaches:pairs.filter(x=>x.wall>2.5).length,
    unresolvedCpuPairs:trials-resolvedCpu.length,
    medianCpuRatio:resolvedCpu.length?median(resolvedCpu):null,
    medianWallRatio:median(pairs.map(x=>x.wall))};
}

if(require.main===module){
  (async()=>{
    /** @type {Awaited<ReturnType<typeof experiment>>[]} */
    const results=[];
    for(const resolverKind of /** @type {const} */ (['sync','async'])){
      for(const bytes of [0,8192]){
        results.push(await experiment(resolverKind,bytes,bytes?25000:250000));
        if(resolverKind==='async')results.push(
          await experiment(resolverKind,bytes,bytes?25000:250000,21,true));
      }
    }
    process.stdout.write('OBFS_SCO_PRINCIPAL_DEADLINE_COST '+JSON.stringify({
      node:process.version,platform:process.platform,results
    })+'\n');
  })().catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={experiment};
