'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {clusterFamilyStrictTail} = require('../sims/cluster-family-strict-tail');
const {clusterStrictTail} = require('../sims/cluster-strict-tail');

/**
 * @param {number} blocks
 * @param {number} workloadCount
 * @param {number|number[]} pairsPerWorkload
 * @returns {Array<{name:string,pairs:Array<{native:number,candidate:number,blockId:string}>}>}
 */
function family(blocks,workloadCount,pairsPerWorkload=1) {
  return Array.from({length:workloadCount},(_,workloadIndex)=>{
    const count=Array.isArray(pairsPerWorkload) ?
      pairsPerWorkload[workloadIndex] : pairsPerWorkload;
    return {
      name:'workload-'+workloadIndex,
      pairs:Array.from({length:blocks*count},(_,index)=>({
        native:10,
        candidate:10,
        blockId:'complete-block-'+Math.floor(index/count)
      }))
    };
  });
}

test('complete-suite blocks directly bound the union event without Bonferroni K',()=>{
  const workloads=family(13,12,13);
  const joint=clusterFamilyStrictTail(workloads);
  const separate=clusterStrictTail(workloads.map(workload=>({pairs:workload.pairs})));
  assert.equal(joint.workloadCount,12);
  assert.equal(joint.independentBlocksDeclared,13);
  assert.equal(joint.pairsPerBlock,156);
  assert.equal(joint.observedPairs,2028);
  assert.equal(joint.observedStrictBreachBlocks,0);
  assert.ok(Math.abs(
    /** @type {number} */(joint.futureAnyWorkloadBlockBreachRateUpperWhenZero) -
    (1-Math.pow(0.05,1/13))
  )<1e-12);
  assert.ok(
    /** @type {number} */(joint.futureAnyWorkloadBlockBreachRateUpperWhenZero) <
    /** @type {number} */(separate.rows[0].futureBlockBreachRateUpperWhenZero)
  );
});

test('299 complete-suite blocks bound future any-workload breach probability by one percent',()=>{
  const joint=clusterFamilyStrictTail(family(299,12,1));
  assert.equal(joint.independentBlocksDeclared,299);
  assert.ok(
    /** @type {number} */(joint.futureAnyWorkloadBlockBreachRateUpperWhenZero) <= 0.01
  );
  const at298=clusterFamilyStrictTail(family(298,12,1));
  assert.ok(
    /** @type {number} */(at298.futureAnyWorkloadBlockBreachRateUpperWhenZero) > 0.01
  );
  const at546=clusterFamilyStrictTail(family(546,12,1));
  assert.ok(
    /** @type {number} */(at546.futureAnyWorkloadBlockBreachRateUpperWhenZero) < 0.0055
  );
});

test('one strict pair in any workload vetoes the complete block; equality is permitted',()=>{
  const workloads=family(4,12,2);
  workloads[2].pairs[4].candidate=25;
  workloads[7].pairs[5].candidate=25.000001;
  const joint=clusterFamilyStrictTail(workloads);
  assert.equal(joint.observedStrictBreachPairs,1);
  assert.equal(joint.observedStrictBreachBlocks,1);
  assert.equal(joint.hasObservedStrictBreach,true);
  assert.equal(joint.futureAnyWorkloadBlockBreachRateUpperWhenZero,null);
});

test('different workload sizes are allowed when each exposure is fixed across blocks',()=>{
  const workloads=family(5,3,[1,2,4]);
  const joint=clusterFamilyStrictTail(workloads);
  assert.deepEqual(joint.pairsPerWorkload,[
    {name:'workload-0',pairsPerBlock:1},
    {name:'workload-1',pairsPerBlock:2},
    {name:'workload-2',pairsPerBlock:4}
  ]);
  assert.equal(joint.pairsPerBlock,7);
  assert.equal(joint.observedPairs,35);
});

test('missing workloads, unequal per-workload exposure, and invalid inputs refuse',()=>{
  assert.throws(()=>clusterFamilyStrictTail([]),TypeError);
  assert.throws(()=>clusterFamilyStrictTail([{name:'',pairs:[]}]),TypeError);
  assert.throws(()=>clusterFamilyStrictTail([
    {name:'a',pairs:[{native:1,candidate:1,blockId:'b'}]},
    {name:'a',pairs:[{native:1,candidate:1,blockId:'b'}]}
  ]),TypeError);
  const missing=family(2,2,1);
  missing[1].pairs.pop();
  assert.throws(()=>clusterFamilyStrictTail(missing),RangeError);
  const unequal=family(2,2,1);
  unequal[0].pairs.push({native:10,candidate:10,blockId:'complete-block-0'});
  assert.throws(()=>clusterFamilyStrictTail(unequal),RangeError);
  const badTime=family(2,2,1);
  badTime[0].pairs[0].candidate=0;
  assert.throws(()=>clusterFamilyStrictTail(badTime),RangeError);
  const badId=family(2,2,1);
  badId[0].pairs[0].blockId='';
  assert.throws(()=>clusterFamilyStrictTail(badId),TypeError);
  assert.throws(()=>clusterFamilyStrictTail(family(2,2),{confidence:1}),RangeError);
  assert.throws(()=>clusterFamilyStrictTail(family(2,2),{threshold:0}),RangeError);
});
