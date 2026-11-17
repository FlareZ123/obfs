'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {generate,runHotpath}=require('../sims/property-hotpath-closedworld');

test('pure-expression graph has actual owned arithmetic source, not precomputed constants',()=>{
  for(const style of /** @type {('direct'|'readers'|'identity')[]} */
    (['direct','readers','identity'])){
    const files=generate(style,'pure-expression');
    assert.match(files[0].code,/hotScore:\(21-14\)/u);
    assert.match(files[0].code,/hotWeight:\(5<<2\)-7/u);
    assert.match(files.find(file=>file.path==='worker.mjs')?.code??'',/for\(let i=0;i<iterations;i\+\+\)/u);
  }
});

test('actual multi-file pure-expression private fields remain exercised and behaviorally equal',async()=>{
  const report=await runHotpath(20000,3,'pure-expression');
  assert.equal(report.valueKind,'pure-expression');
  assert.equal(report.measurements.length,3);
  for(const row of report.measurements){
    assert.equal(row.valueKind,'pure-expression');
    assert.equal(row.properties,2,row.style);
    assert.equal(row.matchingProbes,6,row.style);
    assert.ok(Number.isFinite(row.hotRatio),row.style);
    assert.ok(Number.isFinite(row.wholeRatio),row.style);
    assert.ok(row.sourceBytes>0&&row.emittedBytes>0);
  }
});
