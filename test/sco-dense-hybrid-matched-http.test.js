'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {compare}=require('../sims/sco-dense-hybrid-matched-http');

test('real SCO and minified dense Rivest-3 authenticated hybrid inversion match every request',async()=>{
  const result=await compare();
  assert.equal(result.sco.exact,true);
  assert.equal(result.minified.exact,true);
  assert.equal(result.sco.method,'cegar8');
  assert.equal(result.minified.method,'cegar8');
  assert.equal(result.sco.deniedStatus,403);
  assert.equal(result.minified.deniedStatus,403);
  assert.equal(result.sco.sourceLeaked,false);
  assert.equal(result.minified.sourceLeaked,false);
  assert.equal(result.sco.queries,result.minified.queries);
  assert.equal(result.sco.privateCalls,result.sco.queries);
  assert.equal(result.minified.privateCalls,result.minified.queries);
  assert.equal(result.sco.verifiedInputs,133);
  assert.equal(result.minified.verifiedInputs,133);
  assert.equal(result.matchedTranscript,true);
  assert.match(result.sourceHash,/^[a-f0-9]{64}$/);
  console.log('SCO_DENSE_HYBRID_MATCHED_HTTP '+JSON.stringify(result));
});
