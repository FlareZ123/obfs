'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runHeldoutRankClone}=require('../sims/a2mba-opcode-heldout-rank-clone');

test('same 96 protected held-out sources have exact rank and one-query offline clones',()=>{
  const result=runHeldoutRankClone();
  assert.equal(result.cases,96);
  assert.equal(result.queries,96);
  assert.equal(result.fullRankCases,48);
  assert.deepEqual(result.ranks,{add:31,sub:31,mul:32,and:32,or:32,xor:0});
  assert.equal(result.rows.length,96);
  for(let index=0;index<result.rows.length;index++){
    assert.equal(result.rows[index].rank,result.ranks[result.rows[index].opcode]);
    assert.match(result.rows[index].sourceHash,/^[0-9a-f]{64}$/u);
  }
  assert.equal(new Set(result.rows.map(row=>row.sourceHash)).size,96);
  assert.equal(result.seed,
    'heldout-after-a529fb9:2026-11-19:agent38:a2mba-hybrid-opcode:v1');
  assert.equal(result.attackerCommit,'a529fb903a2116efe1c195ea9a2c181769711686');
});
