'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {compare}=require('../sims/sco-four-shear-reanchor-matched-http');

test('generated authenticated SCO and minified native four-shear HTTP invert identically',async()=>{
  const report=await compare();
  assert.equal(report.rareGateCount,4);
  assert.equal(report.sco.exact,true);
  assert.equal(report.minified.exact,true);
  assert.equal(report.sco.deniedStatus,403);
  assert.equal(report.minified.deniedStatus,403);
  assert.equal(report.sco.privateSourceLeaked,false);
  assert.equal(report.minified.privateSourceLeaked,false);
  assert.equal(report.sco.queries,38);
  assert.equal(report.minified.queries,38);
  assert.equal(report.sco.privateCalls,38);
  assert.equal(report.minified.privateCalls,38);
  assert.equal(report.sco.verifiedInputs,133);
  assert.equal(report.minified.verifiedInputs,133);
  assert.equal(report.matchedTranscript,true);
  assert.equal(report.matchedExactTarget,true);
  assert.match(report.sourceSha256,/^[a-f0-9]{64}$/);
  console.log('SCO_FOUR_SHEAR_MATCHED_HTTP '+JSON.stringify(report));
});
