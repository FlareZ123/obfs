'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createScoWebAuthnAdmission}=require('../src/sco-webauthn-admission');
const {createScoWebAuthnMemoryStore}=require('../src/sco-webauthn-state');

/** @typedef {import('../src/sco-webauthn-state').ScoWebAuthnStateStore} ScoWebAuthnStateStore */

/**
 * A deliberately tiny trusted app: credential enrollment is irrelevant to
 * proving that configured atomic state transitions must not return Promises.
 * @param {ScoWebAuthnStateStore} stateStore
 */
function app(stateStore){
  return createScoWebAuthnAdmission({
    rpId:'localhost',allowedOrigins:['http://localhost:8080'],
    allowInsecureLocalhost:true,stateStore,
    lookupCredential:()=>null,updateSignCount:()=>false
  });
}

test('async configuration assertion cannot be treated as a committed policy fence',()=>{
  const memory=createScoWebAuthnMemoryStore();
  const forged=/** @type {ScoWebAuthnStateStore} */({
    ...memory,assertConfiguration:()=>Promise.resolve()
  });
  assert.throws(()=>app(forged),/synchronous/u,
    'A Promise-returning async policy check must refuse, not silently authorize the gate');
});

test('async challenge insertion cannot issue a nonce before atomic persistence',()=>{
  const memory=createScoWebAuthnMemoryStore();
  const forged=/** @type {ScoWebAuthnStateStore} */({
    ...memory,insertChallenge:()=>Promise.resolve()
  });
  const admission=app(forged);
  assert.throws(()=>admission.issueChallenge('accountA','loginA'),/synchronous/u,
    'Nonce issuance must not acknowledge an asynchronous state write');
});

test('async principal revocation must refuse rather than acknowledge a pending deletion',()=>{
  const memory=createScoWebAuthnMemoryStore();
  const forged=/** @type {ScoWebAuthnStateStore} */({
    ...memory,revokePrincipal:()=>Promise.resolve()
  });
  const admission=app(forged);
  assert.throws(()=>admission.revokePrincipal('accountA'),/synchronous/u,
    'Revocation must not be reported as complete before durable state mutation');
});
