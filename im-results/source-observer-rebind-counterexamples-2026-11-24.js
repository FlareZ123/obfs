'use strict';

// Run from the root of a checkout of the reviewed candidate branch.
// This deliberately exercises advancePlanRanges + validatePlanSemantics
// directly, bypassing acceptPlannedPass because its current Map/array contract
// is inconsistent on the reviewed snapshot.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.cwd();
const {parse,parserContractIdFor} = require(path.join(root,'src','ast'));
const {applyEditsWithMap} = require(path.join(root,'src','source-edit-map'));
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
  advancePlanRanges,
  validatePlanSemantics
} = require(path.join(root,'src','source-observation-plan'));

const source = [
  '// UTF-16 coordinate prefix 😀',
  'const privateRecord = { privateField: 7 };',
  'function observed() { return 29; }',
  'const observedSource = Function.prototype.toString.call(observed);',
  "const label = 'safe-literal';",
  'export const result = privateRecord.privateField;',
  'export const sourceText = observedSource;',
  'export const labelText = label;'
].join('\n');

const hostContract = {
  runtimeFamily: 'Node.js / V8',
  runtimeVersion: process.versions.node,
  contractVersion: 'coo-direct-function-source-v1',
  pristineIntrinsicsPremise:
    'Fresh test realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode; declared compatibility premise only.'
};

const plan = buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
assert.ok(plan,'fixture must produce the reviewed direct-source plan');
const sourceUnitRef = plan.sourceUnits.keys().next().value;
const parserContractId = parserContractIdFor('module');
const initial = getInitialPlanRanges(plan,sourceUnitRef);
const callable = [...plan.sourceSpans.values()].find(span=>
  span.astNodeType==='FunctionDeclaration');
assert.ok(callable,'fixture must expose the callable span');

function check(name,edit) {
  const result = applyEditsWithMap(source,[edit],sourceUnitRef,parserContractId);
  const ast = parse(result.code,'module');
  const next = advancePlanRanges(
    plan,result.map,source,result.code,initial.trackedSourceRanges
  );
  assert.ok(next, name+': original ranges should map');
  const accepted = validatePlanSemantics(plan,result.code,ast,next);
  console.log(name+': '+JSON.stringify({trackedRanges:next.length,validatorAccepted:accepted}));
  assert.equal(accepted,true,name+': current rebind unexpectedly rejected this synthetic pass');
}

function checkMany(name,edits) {
  const result = applyEditsWithMap(source,edits,sourceUnitRef,parserContractId);
  const ast = parse(result.code,'module');
  const next = advancePlanRanges(
    plan,result.map,source,result.code,initial.trackedSourceRanges
  );
  assert.ok(next, name+': original ranges should map');
  const accepted = validatePlanSemantics(plan,result.code,ast,next);
  console.log(name+': '+JSON.stringify({trackedRanges:next.length,validatorAccepted:accepted}));
  assert.equal(accepted,true,name+': current rebind unexpectedly rejected this synthetic pass');
}

check('export-prefix',{
  start:callable.startOffset,end:callable.startOffset,
  text:'export ',affinity:'before-node',
  syntheticOriginId:'review-export-prefix'
});

check('class-Function-shadow',{
  start:0,end:0,text:'class Function {}\n',affinity:'unknown',
  syntheticOriginId:'review-class-function'
});

check('import-Function-shadow',{
  start:0,end:0,text:"import Function from './fake-function.mjs';\n",affinity:'unknown',
  syntheticOriginId:'review-import-function'
});

check('appended-second-reader',{
  start:source.length,end:source.length,
  text:'\nfunction secret() { return 99; }\n'+
    'export const leaked = Function.prototype.toString.call(secret);',
  affinity:'unknown',syntheticOriginId:'review-second-reader'
});

check('intrinsic-toString-mutation',{
  start:0,end:0,
  text:"Function.prototype.toString = function () { return 'tampered'; };\n",
  affinity:'unknown',syntheticOriginId:'review-intrinsic-mutation'
});

const readerDeclarationStart=source.indexOf('const observedSource');
const sourceTextExport='export const sourceText = observedSource;';
const sourceTextExportStart=source.indexOf(sourceTextExport);
assert.ok(readerDeclarationStart>=0&&sourceTextExportStart>=0);

// Producer-level control: the current grammar admits an unrelated primitive
// export even though the Function#toString result does not flow to it.
const disconnectedSource=source.replace(
  sourceTextExport,"export const sourceText = 'fake';"
);
assert.notEqual(disconnectedSource,source);
const disconnectedPlan=buildDirectFunctionSourcePlan(
  disconnectedSource,'entry.mjs',hostContract
);
const linkedEffect=[...plan.hostEffects.values()][0];
const disconnectedEffect=disconnectedPlan&&[...disconnectedPlan.hostEffects.values()][0];
console.log('producer-disconnected-export: '+JSON.stringify({
  planAccepted:Boolean(disconnectedPlan),
  linkedResultValueRef:linkedEffect?.resultValueRef??null,
  disconnectedResultValueRef:disconnectedEffect?.resultValueRef??null,
  linkedValueFlowEdgeCount:plan.valueFlowEdges.size,
  disconnectedValueFlowEdgeCount:disconnectedPlan?.valueFlowEdges.size??null
}));
assert.equal(Boolean(disconnectedPlan),true,
  'reviewed snapshot no longer reproduces the disconnected-export acceptance prediction');
assert.equal(linkedEffect?.resultValueRef,null,
  'reviewed snapshot unexpectedly added the source-read result ValueRef');
assert.equal(disconnectedEffect?.resultValueRef,null,
  'reviewed snapshot unexpectedly added the disconnected plan result ValueRef');
assert.equal(plan.valueFlowEdges.size,0,
  'reviewed snapshot unexpectedly added linked source-result flow');
assert.equal(disconnectedPlan?.valueFlowEdges.size,0,
  'reviewed snapshot unexpectedly added disconnected source-result flow');

// Post-plan control: replacing only the exported initializer leaves both
// tracked callable/reader spans unchanged but changes the delivered value.
check('exported-mirror-overwrite',{
  start:sourceTextExportStart,
  end:sourceTextExportStart+sourceTextExport.length,
  text:"export const sourceText = 'fake';",
  affinity:'unknown',syntheticOriginId:'review-exported-mirror-overwrite'
});

checkMany('mutable-reader-binding',[
  {
    start:readerDeclarationStart,end:readerDeclarationStart+'const'.length,
    text:'let',affinity:'unknown',syntheticOriginId:'review-reader-let'
  },
  {
    start:sourceTextExportStart,end:sourceTextExportStart,
    text:"observedSource = 'fake';\n",affinity:'unknown',
    syntheticOriginId:'review-reader-overwrite'
  }
]);
