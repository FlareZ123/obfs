'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {runAttack,synthesizeTranslationClone,synthesizeAffineClone}=require('../sims/polyvariant-app-oracle-translation');

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
  const affine=synthesizeAffineClone(published,{
    round1:{atZero:10,atOne:13},
    round2:{atZero:-3,atOne:-5},
    round3:{atZero:324,atOne:325}
  });
  const affineContext=vm.createContext({});
  vm.runInContext(affine.replaceAll('export function','function')+
    ';globalThis.result=[round1(5),round2(5),round3(5),unrelated(5)];',
  affineContext,{timeout:1000});
  assert.deepEqual(Array.from(affineContext.result),[25,-13,329,10]);
  assert.throws(()=>synthesizeAffineClone(published,{
    round1:{atZero:10,atOne:13},
    round2:{atZero:-3,atOne:-5},
    round3:{atZero:324,atOne:1.25}
  }),/signed Int32 oracle responses/u);

});

test('published COO application admits full three-query, heldout-validated clone',async()=>{
  const report=await runAttack();
  assert.equal(report.oracleCalls,3);
  assert.deepEqual({...report.offsets},{round1:324,round2:292,round3:324});
  assert.equal(report.heldoutFunctionComparisons,3*4096);
  assert.equal(report.fullApplicationScenarios,12);
  assert.equal(report.fullApplicationEvents,4*(1+50+1000));
  assert.equal(report.nonlinearNegativeControl,true);
  assert.equal(report.affineOracleCalls,6);
  assert.deepEqual({...report.affineSlopes},{round1:1,round2:1,round3:1});
  assert.equal(report.affineHeldoutFunctionComparisons,3*4096);
  assert.equal(report.affineNonlinearNegativeControl,true);
  assert.equal(report.originalGraphUsedForInference,false);
  assert.ok(report.publishedBytes>report.nativeBytes);
  assert.ok(report.nativeBytes>0);
  assert.ok(report.attackMs>=0&&Number.isFinite(report.attackMs));
});
