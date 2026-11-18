'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {launch,stop}=require('./sco-ratchet-transactional-http');

/**
 * Trusted administrative lock hold is deliberately test-only. A missing
 * client session still invokes the ordinary SCO RPC authorization check.
 * @param {boolean} legacy
 * @returns {Promise<{mode:string,anonymousStatus:number,anonymousLatencyMs:number,
 *   committedEvents:number,publicSourceSha256:string,secretLeaked:boolean}>}
 */
async function sample(legacy){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ratchet-anon-'));
  const db=path.join(dir,'ratchet.sqlite');
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Awaited<ReturnType<typeof launch>>[]} */
  const live=[];
  try{
    // Isolate SQLite schema initialization from request-time lock admission.
    const init=new TransactionalRatchet(db,root);
    init.close();
    const holder=await launch(db,root,tokenA,tokenB,control,legacy);
    live.push(holder);
    const probe=await launch(db,root,tokenA,tokenB,control,legacy);
    live.push(probe);
    const pub=await fetch(probe.base+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(pub.status,200);
    const source=await pub.text();
    const sha=createHash('sha256').update(source).digest('hex');
    const secretLeaked=source.includes(root.toString('hex'));
    assert.equal(secretLeaked,false);
    const hold=await fetch(holder.base+'/__test__/hold',{
      method:'POST',headers:{'x-test-control':control}
    });
    assert.equal(hold.status,200);
    assert.equal(await hold.text(),'HELD');
    const start=performance.now();
    const denied=await fetch(probe.base+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'batch',args:[0,[
        createHash('sha256').update('anonymous-probe').digest('hex')
      ]]})
    });
    const anonymousLatencyMs=performance.now()-start;
    assert.equal(denied.status,403);
    // Let the holder's test-only writer lock release before stopping workers.
    const remaining=Math.max(0,1600-anonymousLatencyMs);
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    const read=new TransactionalRatchet(db,root);
    let committedEvents;
    try{
      committedEvents=read.snapshot('verified-A').committed+
        read.snapshot('verified-B').committed;
    }finally{read.close();}
    assert.equal(committedEvents,0);
    return {
      mode:legacy?'legacy-all-requests-lock':'anonymous-preauth-fast-deny',
      anonymousStatus:denied.status,
      anonymousLatencyMs:Number(anonymousLatencyMs.toFixed(3)),
      committedEvents,publicSourceSha256:sha,secretLeaked
    };
  }finally{
    for(const worker of live)await stop(worker,control);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const legacy=await sample(true);
  const repaired=await sample(false);
  assert.equal(legacy.anonymousStatus,403);
  assert.equal(repaired.anonymousStatus,403);
  assert.equal(legacy.committedEvents,0);
  assert.equal(repaired.committedEvents,0);
  assert.equal(legacy.publicSourceSha256,repaired.publicSourceSha256);
  // A 1500 ms trusted writer lock is held before each anonymous RPC starts.
  // The legacy request must wait on SQLite; the repaired request must pass
  // its independent authorizeRpc denial without taking the writer lock.
  assert.ok(legacy.anonymousLatencyMs>800,
    'Legacy negative control did not demonstrate lock waiting');
  assert.ok(repaired.anonymousLatencyMs<500,
    'Repaired anonymous request was delayed by the writer lock');
  const report={
    node:process.version,platform:process.platform,
    heldWriterMilliseconds:1500,
    legacy,repaired,
    admissionFixValidated:true,
    boundary:'Test-only administrative writer lock; anonymous fast deny only. Authenticated A remains able to monopolize the global writer; service latency is not private compute slowdown.'
  };
  process.stdout.write('SCO_RATCHET_ANONYMOUS_LOCK '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,sample};
