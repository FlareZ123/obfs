'use strict';

// Independent exact-pin verification of Agent 50's pass-origin/map-brand prototype.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.cwd();
const {parse,parserContractIdFor}=require(path.join(root,'src','ast'));
const {applyEditsWithMap}=require(path.join(root,'src','source-edit-map'));
const {obfuscateFiles}=require(path.join(root,'src','core'));
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
  const throwChange=applyEditsWithMap(source,[{
    start:0,end:0,text:'throw 0;\n',affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  const throwAst=parse(throwChange.code,'module');
  const throwRanges=advancePlanRanges(
    plan,throwChange.map,source,throwChange.code,initial.trackedSourceRanges
  );
  assert.ok(throwRanges);
  const throwSemanticsAccepted=validatePlanSemantics(
    plan,throwChange.code,throwAst,throwRanges,throwChange.map
  );
  assert.equal(acceptPlannedPass(
    plan,throwChange.map,source,throwChange.code,throwAst,initial.trackedSourceRanges
  ),null,'pass admission must reject an untagged throw even if structural validation accepts it');

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
  assert.equal(acceptPlannedPass(
    plan,literalChange.map,source,literalChange.code,literalAst,initial.trackedSourceRanges
  ),null,'pass-origin admission must reject an untagged literal replacement');

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
  assert.equal(acceptPlannedPass(
    plan,forgedMap,source,appended.code,forgedAst,initial.trackedSourceRanges
  ),null,'module-instance map brand must reject a structurally copied map');

  const native=await importDataModule(source,'native-positive');
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'agent4-pass-origin-fix-review',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.ok(emitted.metrics.properties>=1);
  assert.ok(emitted.metrics.bindings>=1);
  assert.equal(emitted.metrics.literals,0,
    'the FramePosition guard should roll back a top-of-file decoder prologue');
  assert.ok(emitted.code.includes("'safe-literal'"),
    'the original literal must remain when decoder insertion is rejected');
  const compiled=await importDataModule(emitted.code,'emitted-positive');
  assert.equal(compiled.sourceText,native.sourceText);
  assert.equal(compiled.result,native.result);
  assert.equal(compiled.labelText,native.labelText);

  process.stdout.write('POSTPASS_MAP_FIX_REVIEW '+JSON.stringify({
    node:process.version,
    untaggedThrowRejected:true,
    structuralValidatorRejectedThrow:!throwSemanticsAccepted,
    untaggedLiteralReplacementRejected:true,
    structurallyForgedMapRejected:true,
    compilerPositive:{
      properties:emitted.metrics.properties,
      bindings:emitted.metrics.bindings,
      literals:emitted.metrics.literals,
      outputParity:true
    }
  })+'\n');
  process.stdout.write('POSTPASS_MAP_FIX_REVIEW PASS\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
