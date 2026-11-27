'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {invertHybrid,runEvidence}=require('../sims/hybrid-reanchor-cegar-attack');

test('verified hybrid inversions cover forced sparse and dense compatible populations',()=>{
  const report=runEvidence();
  assert.equal(report.total,30);
  assert.equal(report.exact,30);
  assert.equal(report.poisoned,6);
  assert.equal(report.dense,24);
  assert.equal(report.selectedRare,6);
  assert.ok(report.queriesMin>0&&report.queriesMax>0);
  assert.ok(report.rows.every(row=>row.queries>0));
  console.log('HYBRID_REANCHOR_CEGAR '+JSON.stringify(report));
});

test('hybrid attack refuses truncated target and oracle values at its outer boundary',()=>{
  for(const target of [-1,2**32,0.5,NaN,Infinity]) {
    let queries=0;
    assert.throws(()=>invertHybrid(x=>{queries++;return x;},target,0),
      {name:'RangeError',message:'Hybrid target must be an unsigned 32-bit integer'});
    assert.equal(queries,0);
  }
  for(const output of [-1,2**32,0.5,NaN,Infinity]) {
    let queries=0;
    assert.throws(()=>invertHybrid(()=>{queries++;return output;},0,0),
      {name:'RangeError',message:'Hybrid oracle result must be an unsigned 32-bit integer'});
    assert.equal(queries,1,'Bad output must not be forwarded to any fallback inverter');
  }
  const max=0xffffffff;
  const valid=invertHybrid(x=>x,max,0);
  assert.equal(valid.value,max);
  assert.equal(valid.method,'reanchor');
  assert.ok(valid.queries<=65);
});

test('hybrid propagates an oracle transport fault during CEGAR fallback',()=>{
  let calls=0;
  assert.throws(()=>invertHybrid(()=> {
    calls++;
    if(calls>=140)throw new Error('oracle transport failure');
    return 0;
  },0x12345678,0),{name:'Error',message:'oracle transport failure'});
  assert.ok(calls>=140,'Transport fault must occur after the rank-deficient reanchor trial');
});
