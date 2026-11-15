'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runOracleAttack}=require('../sims/sco-public-helper-oracle');

test('two authorized RPC queries clone hidden SCO public-helper sample on held-out strings',async()=>{
  const result=await runOracleAttack();
  assert.equal(result.oracleQueries,2);
  assert.equal(result.deniedStatus,403);
  assert.equal(result.sourceWithheld,true);
  assert.equal(result.methodExposed,true);
  assert.equal(result.privateExecutions,2);
  assert.equal(result.matched,result.heldOut);
  assert.equal(result.heldOut,64);
});
