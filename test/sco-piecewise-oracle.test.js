'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MAX,predict,recoverPiecewise,runPiecewise}=require('../sims/sco-piecewise-oracle');

test('offline piecewise predictor respects the recovered integer cutoff',()=>{
  const model={leftSlope:3,leftOffset:7,rightSlope:11,rightOffset:900,threshold:16};
  assert.equal(predict(model,16),55);
  assert.equal(predict(model,17),1087);
});

test('chosen-input attacker reconstructs a hidden branch with finite probes',async()=>{
  const model={leftSlope:5,leftOffset:23,rightSlope:13,rightOffset:17_000_001,
    threshold:Math.floor(MAX/3)};
  const seen=[];
  const api={async score(x){seen.push(x);return predict(model,x);}};
  const result=await recoverPiecewise(api);
  assert.deepEqual(result.model,model);
  assert.equal(result.probes.length,seen.length);
  assert.ok(result.probes.length<=30);
});

test('real authenticated SCO facade permits limited-query branch reconstruction',async()=>{
  const result=await runPiecewise(4);
  assert.equal(result.scenarios,4);
  assert.ok(result.queries<=120);
  assert.ok(result.heldout>=1000);
  assert.equal(result.allExact,true);
  for(const entry of result.details) {
    assert.equal(entry.sourceDisclosed,false);
    assert.equal(entry.unauthorizedStatus,403);
    assert.deepEqual(entry.recovered,entry.actual);
  }
});
