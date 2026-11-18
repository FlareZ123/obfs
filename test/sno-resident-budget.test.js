'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {buildResident,records,run}=require('../sims/sno-resident-budget');

test('resident workload has deterministic host-facing Unicode records',()=>{
  assert.deepEqual(records(0),[]);
  assert.equal(records(3).length,3);
  assert.deepEqual(records(2).map(record=>record.kind),['open','tick']);
  assert.match(records(1)[0].payload,/β終/u);
});

test('resident SNO loader checks files before handing control to the entry',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-resident-tamper-'));
  try{
    const executable=await buildResident(root,true);
    const target=path.join(root,'math.mjs');
    await atomicWrite(target,(await fs.readFile(target,'utf8'))+'\n// changed after manifest\n');
    const child=spawnSync(process.execPath,[executable],{
      input:'',encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.notEqual(child.status,0);
    assert.match(child.stderr,/Integrity check failed: math\.mjs/u);
    assert.doesNotMatch(child.stdout,/READY/u);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('resident SNO profile executes real protected work and verifies every output', {timeout:120000},async()=>{
  await assert.rejects(run(4),/5 through 100 trials/u);
  const result=await run(5);
  assert.equal(result.initializationExcluded,true);
  assert.equal(result.rows.length,4);
  assert.deepEqual(result.rows.map(row=>row.events),[1,50,1000,10000]);
  assert.deepEqual(result.leafRows.map(row=>row.repetitions),[40000000,80000000]);
  const populations=[...result.rows,...result.leafRows];
  assert.equal(result.strictCpuBreaches,
    populations.reduce((n,row)=>n+row.strictCpuOverBudgetPairs,0));
  assert.equal(result.strictWallBreaches,
    populations.reduce((n,row)=>n+row.strictOverBudgetPairs,0));
  assert.equal(result.cpuSampleVerdict,
    result.strictCpuBreaches?'sample-breached':'sample-unbreached');
  assert.equal(result.medianCpuPopulationsSupported,
    populations.every(row=>row.cpuBudget.decision==='supported'));
  for(const row of populations){
    assert.equal(row.allOutputsEquivalent,true);
    if(row.events===0)assert.ok(row.repetitions>=40000000);
    assert.equal(row.nativeMs.length,5);
    assert.equal(row.snoMs.length,5);
    assert.equal(row.nativeCpuMs.length,5);
    assert.equal(row.snoCpuMs.length,5);
    assert.equal(row.budget.samplePairs,5);
    assert.equal(row.cpuBudget.samplePairs,5);
    assert.equal(row.strictOverBudgetPairs,
      row.nativeMs.filter((ms,index)=>row.snoMs[index]>2.5*ms).length);
    assert.equal(row.strictCpuOverBudgetPairs,
      row.nativeCpuMs.filter((ms,index)=>row.snoCpuMs[index]>2.5*ms).length);
    assert.ok(row.budget.observedPairsWithinBudget<=5);
    assert.ok(row.nativeMs.every(ms=>ms>0));
    assert.ok(row.snoMs.every(ms=>ms>0));
    assert.ok(row.nativeCpuMs.every(ms=>ms>0));
    assert.ok(row.snoCpuMs.every(ms=>ms>0));
  }
});
