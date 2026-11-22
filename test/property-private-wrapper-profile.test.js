'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {generate,measure}=require('../sims/property-hotpath-closedworld');

test('source-stable public wrapper exercises two real cross-file private keys under sustained work',async()=>{
  const files=generate('wrapped','pure-expression');
  assert.match(files.find(file=>file.path==='state.mjs')?.code??'',/hotScore:\(21-14\)/u);
  const worker=files.find(file=>file.path==='worker.mjs')?.code??'';
  assert.match(worker,/function privateHot\(initial,iterations\)/u);
  assert.match(worker,/export function hot\(initial,iterations\)\{return privateHot/u);
  const result=await measure('wrapped',7_000_000,9,'pure-expression');
  assert.equal(result.properties,2);
  assert.equal(result.matchingProbes,6);
  assert.ok(Number.isFinite(result.hotRatio));
  assert.ok(Number.isFinite(result.wholeRatio));
  // These samples document this graph; they do not certify every workload.
  console.log('source-stable-private-wrapper-profile '+JSON.stringify(result));
});
