'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runChallenge}=require('../sims/sco-private-const-relay');

test('attacker relays held-out SCO module-constant HMAC without recovering key',{
  timeout:60000
},async()=>{
  const result=await runChallenge();
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.heldOut,20);
  assert.equal(result.matched,20);
  assert.equal(result.privateCalls,52);
  assert.equal(result.publicSourceHasKey,false);
  assert.ok(result.nativeMedianMs>0);
  assert.ok(result.relayMedianMs>0);
  assert.ok(Number.isFinite(result.clientRatio));
  assert.ok(Number.isFinite(result.thinClientRatio));
  assert.ok(result.clientMedianMs>0);
  assert.ok(result.thinClientMedianMs>0);
  assert.ok(Number.isFinite(result.relayRatio));
  assert.ok(Number.isFinite(result.thinRelayRatio));
  assert.ok(result.thinNativeMedianMs>0);
  assert.ok(result.thinRelayMedianMs>0);
});
