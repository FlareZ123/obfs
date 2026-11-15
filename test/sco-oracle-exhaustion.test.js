'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runOracleExhaustion}=require('../sims/sco-oracle-exhaustion');

test('SCO server-resident finite-domain computation can be exhaustively cloned by authorized requests',async()=>{
  const evidence=await runOracleExhaustion();
  assert.equal(evidence.domainSize,256);
  assert.equal(evidence.exactMatches,256);
  assert.equal(evidence.requests,257);
  assert.equal(evidence.operations,512);
  assert.ok(evidence.batchMilliseconds>0);
  assert.ok(evidence.serialMilliseconds>0);
});
