'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('full microbenchmark exercises actual private hot property rewrites',()=>{
  // The dedicated `npm run benchmark` workflow step enforces the 2.5x budget in isolation.
  // This concurrent suite test verifies transformation yield without a noisy wall-clock gate.
  const child=spawnSync(process.execPath,[path.join(__dirname,'benchmark.js'),'--yield-only'],{
    encoding:'utf8',timeout:60000
  });
  assert.equal(child.status,0,'Benchmark error:\n'+child.stderr+'\n'+child.stdout);
  const rows=child.stdout.split(/\r?\n/u).filter(Boolean);
  assert.equal(rows.length,11,'Unexpected benchmark workload count');
  for(const label of [
    'hot object property',
    'hot string comparison',
    'interprocedural local reader',
    'forwarded object-pattern read',
    'forwarded immediate member read',
    'single-use function factory',
    'single-use arrow factory',
    'single-slot private-array owner access',
    'fixed-slot private-tuple owner access',
    'fixed-field private-record owner access'
  ]) {
    const line=rows.find(row=>row.startsWith(label+': '));
    assert.ok(line,'Missing workload '+label);
    const match=line.match(/properties (\d+)/u);
    assert.ok(match,'Missing property counter: '+line);
    assert.ok(Number(match[1])>=1,
      'The test must exercise renamed private fields: '+line);
  }
});
