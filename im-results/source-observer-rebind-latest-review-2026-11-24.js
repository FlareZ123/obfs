'use strict';

// Independent reviewer-owned acceptance harness for the frame-guarded candidate.
// Run from the root of the exact candidate checkout. This tests the public
// plan builder, source-range mapper, semantic validator and acceptPlannedPass.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.cwd();
const {parse,parserContractIdFor} = require(path.join(root,'src','ast'));
const {obfuscateFiles} = require(path.join(root,'src','core'));
const {applyEditsWithMap} = require(path.join(root,'src','source-edit-map'));
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
  advancePlanRanges,
  validatePlanSemantics,
  acceptPlannedPass
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
assert.ok(plan,'linked source-observer fixture must produce a plan');
const sourceUnitRef = plan.sourceUnits.keys().next().value;
const parserContractId = parserContractIdFor('module');
const initial = getInitialPlanRanges(plan,sourceUnitRef);
assert.ok(initial);
assert.equal(initial.trackedSourceRanges.length,4,
  'the closure must track callable, reader, reader result and export mirror');

const effect = [...plan.hostEffects.values()][0];
assert.ok(effect?.resultValueRef,'host result must have a distinct ValueRef');
assert.equal(effect.effectiveDispatchStatus,'unknown-or-mutable');
assert.equal(effect.effectiveOperationRef.kind,'unknown');
assert.deepEqual(effect.observationEffects,['ExactSource','UnknownHostEffect']);
assert.equal(plan.hostContracts.values().next().value.intrinsicSnapshotId,null);
const resultFact = plan.valueFacts.get(effect.resultValueRef);
assert.equal(resultFact?.proofStatus,'unknown');
assert.deepEqual(resultFact?.categoryPossibilities,['Primitive','Unknown']);
const flowEdges = [...plan.valueFlowEdges.values()];
assert.deepEqual(flowEdges.map(edge=>edge.kind).sort(),['assignment','export']);
const assignment = flowEdges.find(edge=>edge.kind==='assignment');
const exported = flowEdges.find(edge=>edge.kind==='export');
assert.equal(assignment.fromValueRef,effect.resultValueRef);
assert.equal(exported.fromValueRef,assignment.toValueRef);
assert.ok(plan.values.has(exported.toValueRef),
  'exported mirror value must be represented in the plan');

function check(name,edits,expectMapped=true) {
  const changed = applyEditsWithMap(source,edits,sourceUnitRef,parserContractId);
  const ast = parse(changed.code,'module');
  const next = advancePlanRanges(
    plan,changed.map,source,changed.code,initial.trackedSourceRanges
  );
  const validatorAccepted = next ?
    validatePlanSemantics(plan,changed.code,ast,next,changed.map) : false;
  const passAccepted = acceptPlannedPass(
    plan,changed.map,source,changed.code,ast,initial.trackedSourceRanges
  );
  const summary = {
    mapped:Boolean(next),
    validatorAccepted,
    passAccepted:Boolean(passAccepted)
  };
  process.stdout.write(name+': '+JSON.stringify(summary)+'\n');
  assert.equal(validatorAccepted,false,name+': validator must reject the mutation');
  assert.equal(Boolean(passAccepted),false,name+': acceptPlannedPass must reject the mutation');
  if(expectMapped)assert.ok(next,name+': original spans should map before semantic rejection');
  else assert.equal(next,null,name+': changed protected span should fail closed');
}

const callable = [...plan.sourceSpans.values()].find(span=>
  span.astNodeType==='FunctionDeclaration');
assert.ok(callable);
check('export-prefix',[{
  start:callable.startOffset,end:callable.startOffset,
  text:'export ',affinity:'before-node',syntheticOriginId:'review-export-prefix'
}]);
check('class-Function-shadow',[{
  start:0,end:0,text:'class Function {}\n',affinity:'unknown',
  syntheticOriginId:'review-class-function'
}]);
check('import-Function-shadow',[{
  start:0,end:0,text:"import Function from './fake-function.mjs';\n",
  affinity:'unknown',syntheticOriginId:'review-import-function'
}]);
check('appended-second-reader',[{
  start:source.length,end:source.length,
  text:'\nfunction secret() { return 99; }\n'+
    'export const leaked = Function.prototype.toString.call(secret);',
  affinity:'unknown',syntheticOriginId:'review-second-reader'
}]);
check('intrinsic-toString-mutation',[{
  start:0,end:0,
  text:"Function.prototype.toString = function () { return 'tampered'; };\n",
  affinity:'unknown',syntheticOriginId:'review-intrinsic-mutation'
}]);
check('destructured-Function-shadow',[{
  start:0,end:0,
  text:'const {Function} = {Function: function () { return 1; }};\n',
  affinity:'unknown',syntheticOriginId:'review-destructured-function'
}]);
check('top-global-root-alias',[{
  start:0,end:0,text:"top['Function'].prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-top-global-root'
}]);
check('document-defaultView-global-root-alias',[{
  start:0,end:0,text:"document.defaultView['Function'].prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-document-default-view'
}]);
check('catch-binding-does-not-hide-global-root',[{
  start:0,end:0,
  text:"try {} catch (top) {}\ntop['Function'].prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-catch-global-root'
}]);
check('loop-binding-does-not-hide-global-root',[{
  start:0,end:0,
  text:"for (let top of []) {}\ntop['Function'].prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-loop-global-root'
}]);
check('String-constructor-dynamic-code',[{
  start:0,end:0,text:"String.constructor('top[Function]')();\n",
  affinity:'unknown',syntheticOriginId:'review-string-constructor'
}]);
check('constructor-chain-prototype-mutation',[{
  start:0,end:0,text:"({}).constructor.constructor.prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-constructor-chain'
}]);
check('computed-constructor-chain-prototype-mutation',[{
  start:0,end:0,text:"({})['constructor']['constructor'].prototype.toString = 0;\n",
  affinity:'unknown',syntheticOriginId:'review-computed-constructor-chain'
}]);

const readerCallStart = source.indexOf(
  'const observedSource = Function.prototype.toString.call(observed);'
);
assert.ok(readerCallStart>=0);
check('callable-binding-write',[{
  start:readerCallStart,end:readerCallStart,
  text:'observed = function replacement() { return 0; };\n',
  affinity:'unknown',syntheticOriginId:'review-callable-binding-write'
}]);

const sourceTextExport = 'export const sourceText = observedSource;';
const sourceTextExportStart = source.indexOf(sourceTextExport);
assert.ok(sourceTextExportStart>=0);
check('exported-mirror-overwrite',[{
  start:sourceTextExportStart,
  end:sourceTextExportStart+sourceTextExport.length,
  text:"export const sourceText = 'fake';",
  affinity:'unknown',syntheticOriginId:'review-exported-mirror-overwrite'
}],false);

const readerDeclarationStart = source.indexOf('const observedSource');
assert.ok(readerDeclarationStart>=0);
check('mutable-reader-binding',[{
  start:readerDeclarationStart,end:readerDeclarationStart+'const'.length,
  text:'let',affinity:'unknown',syntheticOriginId:'review-reader-let'
},{
  start:sourceTextExportStart,end:sourceTextExportStart,
  text:"observedSource = 'fake';\n",affinity:'unknown',
  syntheticOriginId:'review-reader-overwrite'
}],true);

const disconnectedSource = source.replace(
  sourceTextExport,"export const sourceText = 'fake';"
);
assert.notEqual(disconnectedSource,source);
const disconnectedPlan = buildDirectFunctionSourcePlan(
  disconnectedSource,'entry.mjs',hostContract
);
process.stdout.write('producer-disconnected-export: '+JSON.stringify({
  linkedPlanAccepted:Boolean(plan),
  disconnectedPlanAccepted:Boolean(disconnectedPlan)
})+'\n');
assert.equal(disconnectedPlan,null,
  'producer must refuse a sourceText export disconnected from the reader result');

async function importDataModule(code) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64');
  return import(url);
}

(async()=>{
  const native = await importDataModule(source);
  const result = obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'agent4-independent-rebind-review',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted = result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.notEqual(emitted.code,source);
  assert.ok(emitted.metrics.properties>=1);
  assert.ok(emitted.metrics.bindings>=1);
  assert.equal(emitted.metrics.literals,0,
    'FramePosition guard should roll back top-of-file decoder insertion');
  assert.ok(emitted.code.includes("'safe-literal'"),
    'original literal must remain after decoder pass rollback');
  assert.ok(emitted.code.includes('function observed() { return 29; }'));
  const compiled = await importDataModule(emitted.code);
  assert.equal(compiled.sourceText,native.sourceText);
  assert.equal(compiled.result,native.result);
  assert.equal(compiled.labelText,native.labelText);
  assert.equal(compiled.sourceText,'function observed() { return 29; }');
  process.stdout.write('compiler-positive: '+JSON.stringify({
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    literals:emitted.metrics.literals,
    exactSource:true,
    outputParity:true
  })+'\n');
  process.stdout.write('SOURCE_OBSERVER_REBIND_REVIEW PASS\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
