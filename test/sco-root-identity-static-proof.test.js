'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  proveRootIdentityEligibility,
  ACCEPT_CASES,
  REFUSE_CASES,
  ADVERSARIAL_CASES,
  FIXTURES
}=require('../sims/sco-root-identity-static-proof');

test('root-identity static proof matches preregistered accept corpus',()=>{
  for(const item of ACCEPT_CASES){
    const proof=proveRootIdentityEligibility(item.source);
    assert.equal(proof.eligible,true,item.name+': '+proof.reasons.join('; '));
  }
});

test('root-identity static proof rejects every preregistered unsafe family',()=>{
  for(const item of REFUSE_CASES){
    const proof=proveRootIdentityEligibility(item.source);
    assert.equal(proof.eligible,false,item.name);
    assert.ok(proof.reasons.length>0,item.name+' must carry a refusal reason');
  }
});

test('root-identity static proof rejects post-prereg adversarial reference escapes',()=>{
  for(const item of ADVERSARIAL_CASES){
    const proof=proveRootIdentityEligibility(item.source);
    assert.equal(proof.eligible,false,item.name);
    assert.ok(proof.reasons.length>0,item.name+' must carry a refusal reason');
  }
});

test('root-identity static proof matches realistic frozen fixtures',()=>{
  for(const item of FIXTURES){
    const proof=proveRootIdentityEligibility(item.source);
    assert.equal(proof.eligible,item.expected,item.name+': '+proof.reasons.join('; '));
  }
});
