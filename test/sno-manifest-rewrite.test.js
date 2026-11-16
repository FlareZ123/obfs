'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runEvidence}=require('../sims/sno-manifest-rewrite-attack');

test('SNO mutable public integrity manifest cannot enforce full-control tamper resistance',async()=>{
  const result=await runEvidence();
  assert.equal(result.native,'39');
  assert.equal(result.protected,result.native);
  assert.equal(result.runtimeBypassed,'777');
  assert.equal(result.distributedUnmodified,true);
  assert.equal(result.mutationRejected,true);
  assert.equal(result.bypassed,'999');
  assert.equal(result.digests,2);
});
