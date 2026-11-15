'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runSnoSelfHashBypass}=require('../sims/sno-self-hash-bypass');

test('SNO owner can forge a matching local manifest after modifying the entry',async()=>{
  const evidence=await runSnoSelfHashBypass();
  assert.deepEqual(JSON.parse(evidence.original),{access:false});
  assert.equal(evidence.blocked,'integrity-rejected');
  assert.deepEqual(JSON.parse(evidence.bypassed),{access:true});
  assert.notEqual(evidence.originalEntryHash,evidence.patchedEntryHash);
  assert.notEqual(evidence.originalLauncherHash,evidence.patchedLauncherHash);
});
