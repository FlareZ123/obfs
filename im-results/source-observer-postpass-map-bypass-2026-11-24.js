'use strict';

// Independent exact-pin reproduction of three post-pass admission bypasses.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.cwd();
const {parse,parserContractIdFor}=require(path.join(root,'src','ast'));
const {applyEditsWithMap}=require(path.join(root,'src','source-edit-map'));
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
  advancePlanRanges,
  validatePlanSemantics,
  acceptPlannedPass
}=require(path.join(root,'src','source-observation-plan'));

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
const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
assert.ok(plan);
const sourceUnitRef=plan.sourceUnits.keys().next().value;
const parserContractId=parserContractIdFor('module');
const initial=getInitialPlanRanges(plan,sourceUnitRef);

async function importDataModule(code,tag) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+tag;
  return import(url);
}

(async()=>{
  const native=await importDataModule(source,'native');
  const throwChange=applyEditsWithMap(source,[{
    start:0,end:0,text:'throw 0;\n',affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  const throwAst=parse(throwChange.code,'module');
  const throwRanges=advancePlanRanges(
    plan,throwChange.map,source,throwChange.code,initial.trackedSourceRanges
  );
  assert.ok(throwRanges);
  assert.equal(validatePlanSemantics(
    plan,throwChange.code,throwAst,throwRanges,throwChange.map
  ),true,'structural validator is not a complete semantic-equivalence proof');
  const throwAccepted=acceptPlannedPass(
    plan,throwChange.map,source,throwChange.code,throwAst,initial.trackedSourceRanges
  );
  assert.ok(throwAccepted,'candidate currently admits untagged top-level throw');
  let throwObserved=false;
  try {
    await importDataModule(throwChange.code,'throw-change');
  } catch(error) {
    throwObserved=error===0;
  }
  assert.equal(throwObserved,true,'admitted throw must change module evaluation');

  const literal="'safe-literal'";
  const literalStart=source.indexOf(literal);
  assert.ok(literalStart>=0);
  const literalChange=applyEditsWithMap(source,[{
    start:literalStart,end:literalStart+literal.length,text:"'attacker-value'"
  }],sourceUnitRef,parserContractId);
  const literalAst=parse(literalChange.code,'module');
  const literalRanges=advancePlanRanges(
    plan,literalChange.map,source,literalChange.code,initial.trackedSourceRanges
  );
  assert.ok(literalRanges);
  const literalAccepted=acceptPlannedPass(
    plan,literalChange.map,source,literalChange.code,literalAst,initial.trackedSourceRanges
  );
  assert.ok(literalAccepted,'candidate currently admits untagged unprotected literal replacement');
  const changedLiteral=await importDataModule(literalChange.code,'literal-change');
  assert.equal(native.labelText,'safe-literal');
  assert.equal(changedLiteral.labelText,'attacker-value');

  const appended=applyEditsWithMap(source,[{
    start:source.length,end:source.length,text:'\nthrow 0;\n',affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  const forgedMap=Object.freeze({
    ...appended.map,
    segments:Object.freeze([Object.freeze({
      fromStart:0,fromEnd:source.length,toStart:0,toEnd:source.length,
      kind:'unchanged',affinity:null,syntheticOriginId:null
    })])
  });
  const forgedAst=parse(appended.code,'module');
  const forgedAccepted=acceptPlannedPass(
    plan,forgedMap,source,appended.code,forgedAst,initial.trackedSourceRanges
  );
  assert.ok(forgedAccepted,'candidate currently accepts a structurally copied map that hides the appended throw');
  let forgedThrowObserved=false;
  try {
    await importDataModule(appended.code,'forged-map-change');
  } catch(error) {
    forgedThrowObserved=error===0;
  }
  assert.equal(forgedThrowObserved,true);

  process.stdout.write('POSTPASS_MAP_BYPASS_REPRODUCED '+JSON.stringify({
    node:process.version,
    untaggedThrowAccepted:true,
    untaggedThrowChangesModuleEvaluation:true,
    untaggedLiteralReplacementAccepted:true,
    untaggedLiteralChangesExport:true,
    structurallyForgedMapAccepted:true,
    forgedMapHidesAppendedThrow:true
  })+'\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
