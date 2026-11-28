'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  decodeThreeState,reachableStates,minimalThree,censusThreeState
}=require('../sims/sco-two-state-out-of-class-census');

test('explicit three-state out-of-class witness has reachable, distinct states',()=>{
  const model=decodeThreeState(52);
  assert.deepEqual(model.next,[[2,1],[0,0],[0,0]]);
  assert.deepEqual(model.output,[[0,0],[1,0],[0,0]]);
  assert.equal(reachableStates(model),3);
  assert.equal(minimalThree(model),true);
  assert.throws(()=>decodeThreeState(-1),RangeError);
  assert.throws(()=>decodeThreeState(46656),RangeError);
});

test('complete 46,656-table misspecification census keeps false certificates visible',async()=>{
  const result=await censusThreeState();
  assert.equal(result.population,46656);
  assert.equal(result.certifiedEquivalent,27272);
  assert.equal(result.falseCertificates,17608);
  assert.equal(result.contradictions,1776);
  assert.deepEqual(result.groups,{
    reachableOne:{equivalent:5184,falseCertificate:0,contradiction:0},
    reachableTwo:{equivalent:13824,falseCertificate:0,contradiction:0},
    reachableThreeReducible:{equivalent:4944,falseCertificate:0,contradiction:0},
    reachableThreeMinimal:{equivalent:3320,falseCertificate:17608,contradiction:1776}
  });
  assert.deepEqual(result.falseByCalls,{6:5136,7:6312,8:3072,9:3088});
  assert.deepEqual(result.trueByCalls,{6:5232,7:15480,8:2640,9:3920});
  assert.deepEqual(result.contradictionByCalls,{6:1008,7:768});
  assert.deepEqual(result.firstFalse,{
    id:52,calls:7,
    inputs:[0,1,0,1,1,0,0],
    outputs:[0,0,0,0,0,1,0]
  });
  assert.deepEqual(result.firstContradiction,{id:455,calls:7});
  const total=Object.values(result.groups).reduce((sum,bucket)=>
    sum+bucket.equivalent+bucket.falseCertificate+bucket.contradiction,0);
  assert.equal(total,result.population);
});
