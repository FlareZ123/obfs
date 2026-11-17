'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {runAttack,synthesizeTranslationClone}=require('../sims/polyvariant-app-oracle-translation');

test('three-query translation hypothesis preserves public ESM names and rejects unsupported oracle data',()=>{
  const published='export function round1(x){return x+1;}'+
    'export function round2(x){return x+2;}'+
    'export function round3(x){return x+3;}'+
    'export function unrelated(x){return x*2;}';
  assert.throws(()=>synthesizeTranslationClone(published,{
    round1:1,round2:2,round3:1.25
  }),/signed Int32 oracle response/u);
  assert.throws(()=>synthesizeTranslationClone(
    'export function round1(x){return x+1;}',{
      round1:1,round2:2,round3:3
    }
  ),/public named function/u);
  const output=synthesizeTranslationClone(published,{
    round1:9,round2:-18,round3:324
  });
  assert.ok(output.includes('export function unrelated(x){return x*2;}'));
  const script=output.replaceAll('export function','function')+
    ';globalThis.result=[round1(5),round2(5),round3(5),unrelated(5)];';
  const context=vm.createContext({});
  vm.runInContext(script,context,{timeout:1000});
  assert.deepEqual(Array.from(context.result),[14,-13,329,10]);
});

test('published COO application admits full three-query, heldout-validated clone',async()=>{
  const report=await runAttack();
  assert.equal(report.oracleCalls,3);
  assert.deepEqual({...report.offsets},{round1:324,round2:292,round3:324});
  assert.equal(report.heldoutFunctionComparisons,3*4096);
  assert.equal(report.fullApplicationScenarios,9);
  assert.equal(report.fullApplicationEvents,3*(1+50+1000));
  assert.equal(report.nonlinearNegativeControl,true);
  assert.equal(report.originalGraphUsedForInference,false);
  assert.ok(report.attackMs>=0&&Number.isFinite(report.attackMs));
});
