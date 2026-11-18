'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createScoKeyedIsolation}=require('../src/rpc-keyed-isolation');

/** @typedef {{cpuMs:number,wallMs:number,effects:number}} Sample */
/** @typedef {{cpu:number,wall:number}} Pair */
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
 * @returns {Promise<{resolverKind:string,workBytes:number,iterations:number,
 *   trials:number,pairs:Pair[],strictCpuBreaches:number,strictWallBreaches:number,
 *   medianCpuRatio:number,medianWallRatio:number}>}
 */
async function experiment(resolverKind,workBytes,iterations=10000,trials=7){
  const resolvePrincipal=resolverKind==='sync'?
    ()=> 'verified' : async()=> 'verified';
  const baseline=createScoKeyedIsolation(resolvePrincipal,{maxPendingTotal:2});
  const deadline=createScoKeyedIsolation(resolvePrincipal,{
    maxPendingTotal:2,maxPrincipalResolutionMs:10000
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
    assert.ok(direct.cpuMs>0&&direct.wallMs>0&&guarded.cpuMs>0&&guarded.wallMs>0);
    pairs.push({cpu:guarded.cpuMs/direct.cpuMs,wall:guarded.wallMs/direct.wallMs});
  }
  return {resolverKind,workBytes,iterations,trials,pairs,
    strictCpuBreaches:pairs.filter(x=>x.cpu>2.5).length,
    strictWallBreaches:pairs.filter(x=>x.wall>2.5).length,
    medianCpuRatio:median(pairs.map(x=>x.cpu)),
    medianWallRatio:median(pairs.map(x=>x.wall))};
}

if(require.main===module){
  (async()=>{
    /** @type {Awaited<ReturnType<typeof experiment>>[]} */
    const results=[];
    for(const resolverKind of /** @type {const} */ (['sync','async'])){
      for(const bytes of [0,8192])results.push(
        await experiment(resolverKind,bytes));
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
