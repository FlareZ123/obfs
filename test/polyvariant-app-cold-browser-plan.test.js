'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {trialOrders,page}=require('./polyvariant-app-cold-browser');

const variants=['native','published','reconstructed'];

test('cold Chromium order is complete, permutation-balanced and stable',()=>{
  const schedule=trialOrders();
  assert.equal(schedule.length,9);
  /** @type {Record<string,number[]>} */
  const rankCounts=Object.fromEntries(variants.map(name=>[name,[0,0,0]]));
  for(const order of schedule){
    assert.equal(order.length,variants.length);
    assert.deepEqual([...order].sort(),[...variants].sort());
    for(let rank=0;rank<order.length;rank++)rankCounts[order[rank]][rank]++;
  }
  for(const name of variants)assert.deepEqual(rankCounts[name],[3,3,3]);
  assert.equal(new Set(schedule.slice(0,6).map(order=>order.join('/'))).size,6,
    'Each of the six three-variant permutations must occur once');
  assert.deepEqual(trialOrders(),schedule,'Schedule must be deterministic');
});

test('browser page executes the exact validated counterbalanced schedule',()=>{
  const html=page();
  assert.ok(html.includes('const orders='+JSON.stringify(trialOrders())+';'));
  assert.ok(html.includes('for(const variant of orders[trial])'));
  assert.ok(html.includes("await import('/graphs/'+variant+'/'+count+'/'+trial+'/entry.mjs')"));
  assert.ok(html.includes('clockProbeMs<0.1'));
  assert.ok(html.includes('const hotCpu={native:[],published:[],reconstructed:[]}'));
  assert.ok(html.includes('hotCpu[variant].push(hotRun(variant))'));
  assert.ok(html.includes('const targetOutput=hotGraph.native.runScenario'));
});
