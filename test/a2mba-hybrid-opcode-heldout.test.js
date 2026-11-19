'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {classifyInt32Binary}=require('../sims/a2mba-hybrid-opcode-classifier');
const {ATTACKER_COMMIT,SEED,runHeldout}=require('../sims/a2mba-hybrid-opcode-heldout');

test('one probe distinguishes the six admitted pure-IR i32 operations',()=>{
  assert.equal(classifyInt32Binary((x,y)=>(x+y)|0),'add');
  assert.equal(classifyInt32Binary((x,y)=>(x-y)|0),'sub');
  assert.equal(classifyInt32Binary((x,y)=>Math.imul(x,y)),'mul');
  assert.equal(classifyInt32Binary((x,y)=>x&y),'and');
  assert.equal(classifyInt32Binary((x,y)=>x|y),'or');
  assert.equal(classifyInt32Binary((x,y)=>x^y),'xor');
});

test('frozen one-query classifier recovers every post-freeze MBA-style heldout expression',()=>{
  assert.deepEqual(runHeldout(),{
    cases:96,
    exactRecoveries:96,
    totalCandidateCalls:96,
    attackerCommit:ATTACKER_COMMIT,
    seed:SEED
  });
  assert.equal(ATTACKER_COMMIT,'a529fb903a2116efe1c195ea9a2c181769711686');
});
