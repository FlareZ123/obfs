'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parserContractIdFor,parse}=require('../src/ast');
const {applyEditsWithMap}=require('../src/source-edit-map');
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
  advancePlanRanges,
  validatePlanSemantics,
  acceptPlannedPass
}=require('../src/source-observation-plan');

const source=[
  '// UTF-16 coordinate prefix 😀',
  'const privateRecord = { privateField: 7 };',
  'function observed() { return 29; }',
  'const observedSource = Function.prototype.toString.call(observed);',
  "const label = 'safe-literal';",
  'export const result = privateRecord.privateField;',
  'export const sourceText = observedSource;',
  'export const labelText = label;'
].join('\n');

const hostContract={
  runtimeFamily:'Node.js / V8',
  runtimeVersion:process.versions.node,
  contractVersion:'coo-direct-function-source-v1',
  pristineIntrinsicsPremise:
    'Fresh test realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode; declared compatibility premise only.'
};

test('constructor-chain intrinsic mutation against pinned pre-guard validator',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan,'baseline plan must build');
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const initial=getInitialPlanRanges(plan,sourceUnitRef);
  const inserted='({}).constructor.constructor.prototype.toString = 0;\n';
  const changed=applyEditsWithMap(source,[{
    start:0,end:0,text:inserted,affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  const ast=parse(changed.code,'module');
  const next=advancePlanRanges(plan,changed.map,source,changed.code,
    initial.trackedSourceRanges);
  const structural=next?validatePlanSemantics(plan,changed.code,ast,next):false;
  const accepted=next?acceptPlannedPass(plan,changed.map,source,changed.code,ast,
    initial.trackedSourceRanges):null;
  const record={
    candidateSha:'ff4bc9037fbb42a4900a362ac2dd847297635263',
    source,
    inserted,
    sourceUnitRef,
    parserContractId,
    editMap:changed.map,
    mappedRangeCount:next?.length??0,
    validatePlanSemantics:structural,
    acceptPlannedPass:Boolean(accepted)
  };
  console.log('AGENT20_VALIDATOR_PROBE '+JSON.stringify(record));
  assert.equal(structural,true,'pre-guard structural validator should reveal whether it accepts the constructor-chain insertion');
  assert.ok(accepted,'pre-guard acceptPlannedPass should reveal whether it admits the insertion');
});
