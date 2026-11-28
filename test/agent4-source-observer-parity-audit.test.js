'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {audit}=require('../sims/source-observer-parity-audit');

/**
 * @param {string} name
 * @param {boolean} nativeShared
 * @param {number} bindings
 * @param {boolean} [parity=true]
 * @returns {string}
 */
function record(name,nativeShared,bindings,parity=true) {
  const source=nativeShared?'function privateRead(){return 7;}':'';
  return '2026-11-28T10:00:00Z CFG_CARRIER '+JSON.stringify({
    name,nativeShared,group:nativeShared,local:false,
    evidence:['coo','sco','sno'].map(mode=>({
      mode,bindings,nativeSource:source,
      emittedSource:parity?source:source+'mod',
      parity
    }))
  });
}

test('carrier audit preserves true refusal and positive-yield counts for all modes',()=>{
  const result=audit([record('shared',true,0),record('ordinary',false,4)].join('\n'));
  assert.deepEqual(result,{
    rows:2,nativeShared:1,nativeNotShared:1,
    safeRefusals:1,positiveRewrites:1,unsafeRewrites:[],zeroYield:[],
    parityFailures:[],modeDisagreements:[],duplicateNames:[]
  });
});
test('carrier audit independently reports unsafe rewriting and vacuous refusal',()=>{
  const result=audit([record('unsafe',true,4,false),
    record('overrefused',false,0)].join('\n'));
  assert.deepEqual(result.unsafeRewrites,['unsafe']);
  assert.deepEqual(result.parityFailures,['unsafe']);
  assert.deepEqual(result.zeroYield,['overrefused']);
});
test('carrier audit preserves duplicate/missing mode evidence as uncertainty',()=>{
  const valid=record('repeated',true,0);
  const missing=record('missing-mode',false,4).replace(
    '\"mode\":\"sno\"','\"mode\":\"coo\"');
  const result=audit([valid,valid,missing].join('\n'));
  assert.deepEqual(result.duplicateNames,['repeated']);
  assert.deepEqual(result.modeDisagreements,['missing-mode']);
});
test('carrier audit rejects malformed fixture records',()=>{
  assert.throws(()=>audit('CFG_CARRIER {\"name\":5}'),/Malformed CFG_CARRIER/u);
});
