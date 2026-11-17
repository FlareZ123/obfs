'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runEvidence,countFunctionEntries}=require('../sims/polyvariant-app-execution-coverage');

test('count only the three selected exported arithmetic function entries',()=>{
  const source=[
    'export function round1(input){return input|0;}',
    'export function round2(input){return input|0;}',
    'export function round3(input){return input|0;}',
    'export function unrelated(input){return input|0;}'
  ].join('\n');
  const instrumented=countFunctionEntries(source);
  assert.equal((instrumented.match(/__obfsCoverageCounts\./g)||[]).length,3);
  assert.ok(instrumented.includes('export function unrelated(input){return input|0;}'));
  assert.throws(()=>countFunctionEntries('export function round1(x){return x;}'));

});

test('actually exercised arithmetic work remains identical after public source-only reconstruction',{
  timeout:120000
},async()=>{
  const evidence=await runEvidence();
  assert.equal(evidence.selectedSourceBytes,309);
  assert.equal(evidence.selectedFunctionAstBytes,284);
  assert.equal(evidence.totalOriginalBytes,2467);
  assert.equal(evidence.reconstructedFunctions,3);
  assert.match(evidence.distributedMathSha256,/^[a-f0-9]{64}$/);
  assert.match(evidence.reconstructedMathSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(evidence.distributedMathSha256,evidence.reconstructedMathSha256);
  assert.deepEqual(evidence.rows.map(row=>row.events),[1,50,1000,10000]);
  for(const row of evidence.rows){
    assert.ok(row.codeUnits>=row.events);
    for(const kind of ['native','published','reconstructed']){
      assert.deepEqual(row.actual[kind],{
        round1:row.codeUnits,round2:row.codeUnits,round3:row.codeUnits
      });
      assert.equal(row.hostEmissions[kind],row.events);
    }
  }
});
