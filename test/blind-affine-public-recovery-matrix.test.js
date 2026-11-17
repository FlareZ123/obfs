'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const {recover}=require('../sims/polyvariant-affine-static-recover');
const {runEvidence}=require('../sims/blind-affine-public-recovery-matrix');

/** @param {string} source @returns {string} */
function sha256(source){return createHash('sha256').update(source).digest('hex');}

test('both mode releases are reconstructible with unseen private source and compiler seed',{
  timeout:120000
},async()=>{
  const result=await runEvidence(3);
  assert.equal(result.privateSourceVaries,true);
  assert.equal(result.publishedSourceVaries,true);
  assert.equal(result.transcripts.length,6);
  assert.equal(result.reviewer,'known-source-only-static-ast-negative-control');
  assert.deepEqual(Object.keys(result.summaries),['coo','sno']);
  for(const mode of ['coo','sno']){
    const stats=result.summaries[/** @type {'coo'|'sno'} */(mode)];
    assert.equal(stats.samples,3);
    assert.equal(stats.recoveredFunctions,9);
    assert.equal(stats.heldoutChecks,9216);
    assert.ok(stats.minAttackMs>=0);
    assert.ok(Number.isFinite(stats.medianAttackMs));
    assert.ok(stats.maxEmittedBytes>=stats.minEmittedBytes);
    assert.ok(stats.minEmittedBytes>0);
  }
  const privateHashes=new Set();
  const publishedHashes=new Set();
  for(const audit of result.transcripts){
    assert.equal(sha256(audit.publishedSource),audit.sourceSha256);
    assert.equal(sha256(audit.salt+'\0'+audit.originalSource),audit.commitment);
    assert.equal(audit.heldoutChecks,3072);
    assert.equal(Buffer.byteLength(audit.publishedSource),audit.emittedBytes);
    assert.equal(Object.keys(audit.answer).length,3);
    for(const [name,offset] of Object.entries(audit.answer)){
      assert.ok(Number.isSafeInteger(offset));
      assert.equal(recover(audit.publishedSource,name,'module').offset,offset);
    }
    privateHashes.add(sha256(audit.originalSource));
    publishedHashes.add(audit.sourceSha256);
  }
  assert.equal(privateHashes.size,6);
  assert.equal(publishedHashes.size,6);
});

test('randomized private-source matrix requires at least two instances per mode',async()=>{
  await assert.rejects(runEvidence(1),/between 2 and 100/u);
  await assert.rejects(runEvidence(101),/between 2 and 100/u);
  await assert.rejects(runEvidence(3.5),/between 2 and 100/u);
});
