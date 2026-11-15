'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {atomicWrite}=require('../src/atomic');
const {spawnSync}=require('node:child_process');
const {summarizeCoverage}=require('../sims/jsdeobsbench-coverage');

test('coverage counters and emitted size are kept separate from security conclusions',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-coverage-'));
  const file=path.join(directory,'input.jsonl');
  try {
    const records=[
      {original:'a',obfuscated:'xx',obfs_metrics:{properties:1,bindings:2,literals:0,objects:1}},
      {original:'abc',obfuscated:'y',obfs_metrics:{properties:0,bindings:0,literals:2,objects:0}}
    ];
    await atomicWrite(file,records.map(item=>JSON.stringify(item)).join('\n')+'\n');
    const summary=await summarizeCoverage(file);
    assert.equal(summary.files,2);
    assert.equal(summary.sourceBytes,4);
    assert.equal(summary.obfuscatedBytes,3);
    assert.equal(summary.sizeRatio,0.75);
    assert.equal(summary.withPropertyRewrites,1);
    assert.equal(summary.withBindingRewrites,1);
    assert.equal(summary.withEncodedLiterals,1);
    assert.equal(summary.properties,1);
    assert.equal(summary.bindings,2);
    assert.equal(summary.literals,2);
    assert.equal(summary.objects,1);
    const script=path.join(__dirname,'..','sims','jsdeobsbench-coverage.js');
    const positive=spawnSync(process.execPath,[script,file,'--require-transform'],{encoding:'utf8'});
    assert.equal(positive.status,0,positive.stderr);
    await atomicWrite(file,JSON.stringify({
      original:'const a=1',obfuscated:'const a=1',
      obfs_metrics:{properties:0,bindings:0,literals:0,objects:0}
    })+'\n');
    const vacuous=spawnSync(process.execPath,[script,file,'--require-transform'],{encoding:'utf8'});
    assert.equal(vacuous.status,1,vacuous.stderr);

    await atomicWrite(file,JSON.stringify({original:'a',obfuscated:'b',obfs_metrics:{properties:-1}})+'\n');
    await assert.rejects(summarizeCoverage(file),/metric/);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
