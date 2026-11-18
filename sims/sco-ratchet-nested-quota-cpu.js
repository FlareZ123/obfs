'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoKeyedIsolation}=require('../src');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {bucketOf}=require('./sco-ratchet-bucket-keys');

/** @typedef {{wallMs:number,cpuMs:number}} Times */
/** @typedef {{kind:'fresh'|'cached'|'denied',outputs:string[],privateExecutions:number}} Decision */

/**
 * @param {()=>Promise<string[]>} fn
 * @returns {Promise<{times:Times,outputs:string[]}>}
 */
async function timed(fn){
  const began=performance.now();
  const usage=process.cpuUsage();
  const outputs=await fn();
  const delta=process.cpuUsage(usage);
  return {
    outputs,times:{
      wallMs:performance.now()-began,
      cpuMs:(delta.user+delta.system)/1000
    }
  };
}

/** @param {string} principal @param {number} seq @returns {string} */
function challenge(principal,seq){
  return createHash('sha256').update(principal+'/'+seq).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} name
 * @param {number} seq
 * @param {string[]} inputs
 * @param {TransactionalRatchet} store
 * @returns {string[]}
 */
function batch(name,seq,inputs,store){
  const decision=/** @type {Decision} */(store.batch(name,seq,inputs));
  assert.equal(decision.kind,'fresh');
  assert.equal(decision.privateExecutions,inputs.length);
  return decision.outputs;
}

/** @returns {Promise<object>} */
async function experiment(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-nested-quota-cpu-'));
  const root=randomBytes(32);
  const oldStore=new TransactionalRatchet(path.join(dir,'old.sqlite'),root);
  const nestedStore=new TransactionalRatchet(path.join(dir,'nested.sqlite'),root);
  const original=createPrivateMachine(root);
  const oldIsolate=createScoKeyedIsolation(req=>{
    const cookie=req.headers.cookie;
    assert.equal(typeof cookie,'string');
    return 'bucket-'+bucketOf(root,'verified-A',8);
  },{maxPendingPerPrincipal:16,maxPendingTotal:32});
  const outer=createScoKeyedIsolation(req=>{
    assert.equal(req.headers.cookie,'session=verified-A');
    return 'verified-A';
  },{maxPendingPerPrincipal:16,maxPendingTotal:32});
  const inner=createScoKeyedIsolation(req=>{
    assert.equal(req.headers.cookie,'session=verified-A');
    return 'bucket-'+bucketOf(root,'verified-A',8);
  });
  const request=/** @type {import('node:http').IncomingMessage} */(
    /** @type {unknown} */({headers:{cookie:'session=verified-A'}}));
  /** @type {{count:number,trial:number,seq:number,
    native:Times,old:Times,nested:Times,oldWallRatio:number,nestedWallRatio:number,
    oldCpuRatio:number|null,nestedCpuRatio:number|null,
    nestedOverOldCpuRatio:number|null,nestedOverOldWallRatio:number}[]} */
  const rows=[];
  try{
    for(const count of [1,16,64]){
      const principal='verified-A-'+count;
      let seq=0;
      for(let trial=0;trial<7;trial++){
        const inputs=Array.from({length:count},(_,i)=>challenge(principal,seq+i));
        /** @type {Record<'native'|'old'|'nested',{times:Times,outputs:string[]}>} */
        const measured=/** @type {Record<'native'|'old'|'nested',{times:Times,outputs:string[]}>} */({});
        /** @returns {Promise<string[]>} */
        const nativeWork=async()=>inputs.map((input,i)=>{
          const result=original.advance(principal,seq+i,input);
          assert.equal(typeof result,'string');
          return /** @type {string} */(result);
        });
        /** @returns {Promise<string[]>} */
        const oldWork=async()=>{
          /** @type {string[]|undefined} */
          let outputs;
          await oldIsolate(request,async()=>{
            outputs=batch(principal,seq,inputs,oldStore);
          });
          assert.ok(outputs);
          return outputs;
        };
        /** @returns {Promise<string[]>} */
        const nestedWork=async()=>{
          /** @type {string[]|undefined} */
          let outputs;
          await outer(request,()=>inner(request,async()=>{
            outputs=batch(principal,seq,inputs,nestedStore);
          }));
          assert.ok(outputs);
          return outputs;
        };
        const callbacks={native:nativeWork,old:oldWork,nested:nestedWork};
        const schedules=[
          /** @type {('native'|'old'|'nested')[]} */(['native','old','nested']),
          /** @type {('native'|'old'|'nested')[]} */(['old','nested','native']),
          /** @type {('native'|'old'|'nested')[]} */(['nested','native','old'])
        ];
        for(const arm of schedules[trial%3]){
          measured[arm]=await timed(callbacks[arm]);
        }
        assert.deepEqual(measured.old.outputs,measured.native.outputs);
        assert.deepEqual(measured.nested.outputs,measured.native.outputs);
        const n=measured.native.times;
        const o=measured.old.times;
        const q=measured.nested.times;
        rows.push({
          count,trial,seq,native:n,old:o,nested:q,
          oldWallRatio:Number((o.wallMs/n.wallMs).toFixed(5)),
          nestedWallRatio:Number((q.wallMs/n.wallMs).toFixed(5)),
          oldCpuRatio:n.cpuMs>0&&o.cpuMs>0?
            Number((o.cpuMs/n.cpuMs).toFixed(5)):null,
          nestedCpuRatio:n.cpuMs>0&&q.cpuMs>0?
            Number((q.cpuMs/n.cpuMs).toFixed(5)):null,
          nestedOverOldCpuRatio:o.cpuMs>0&&q.cpuMs>0?
            Number((q.cpuMs/o.cpuMs).toFixed(5)):null,
          nestedOverOldWallRatio:Number((q.wallMs/o.wallMs).toFixed(5))
        });
        seq+=count;
      }
      assert.deepEqual(oldStore.snapshot(principal),{seq,committed:seq});
      assert.deepEqual(nestedStore.snapshot(principal),{seq,committed:seq});
    }
    const summary=[1,16,64].map(count=>{
      const selected=rows.filter(row=>row.count===count);
      /** @param {'old'|'nested'} key @returns {object} */
      function armSummary(key){
        const get=/** @param {typeof selected[number]} row */(row)=>
          key==='old'?row.oldCpuRatio:row.nestedCpuRatio;
        const evaluated=selected.map(get).filter(x=>x!==null);
        return {
          medianWallRatio:median(selected.map(row=>
            key==='old'?row.oldWallRatio:row.nestedWallRatio)),
          strictWallAbove2_5:selected.filter(row=>
            (key==='old'?row.oldWallRatio:row.nestedWallRatio)>2.5).length,
          evaluatedCpuPairs:evaluated.length,
          medianCpuRatio:evaluated.length?
            median(evaluated.map(x=>/** @type {number} */(x))):null,
          strictCpuAbove2_5:evaluated.filter(x=>x!==null&&x>2.5).length
        };
      }
      const validIncrement=selected.map(row=>row.nestedOverOldCpuRatio)
        .filter(x=>x!==null);
      return {
        protectedEventsPerArm:7*count,eventsPerBatch:count,trials:7,
        old:armSummary('old'),nested:armSummary('nested'),
        nestedOverOldMeasuredCpuPairs:validIncrement.length,
        nestedOverOldMedianCpuRatio:validIncrement.length?
          median(validIncrement.map(x=>/** @type {number} */(x))):null,
        nestedOverOldMedianWallRatio:median(selected.map(row=>row.nestedOverOldWallRatio))
      };
    });
    const report={
      node:process.version,platform:process.platform,privateWorkBytesPerEvent:8388608,
      originalEventsPerArm:7*(1+16+64),originalOutputParity:true,
      allPersistentSequenceStatesMatch:true,storesPreinitialized:true,
      summary,rows,
      boundary:'Trusted Node in-process CPU and wall only. No HTTP/client, authorization, browser, WAN or actual concurrent queues. Positive original-HMAC work and matching stored outputs, with startup excluded. One-level versus nested queues retain exactly the original private computation.'
    };
    process.stdout.write('SCO_RATCHET_NESTED_QUOTA_CPU '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    oldStore.close();
    nestedStore.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment};
