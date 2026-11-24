'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.cwd();
const {parse,parserContractIdFor}=require(path.join(root,'src','ast'));
const {applyEditsWithMap}=require(path.join(root,'src','source-edit-map'));
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
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
    'Fresh test realm with unmodified Function.prototype.toString and String.fromCharCode; declared compatibility premise only.'
};

const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
assert.ok(plan,'the baseline direct-reader fixture must produce a plan');
const sourceUnitRef=plan.sourceUnits.keys().next().value;
const parserContractId=parserContractIdFor('module');
const initial=getInitialPlanRanges(plan,sourceUnitRef);

const literal="'safe-literal'";
const literalStart=source.indexOf(literal);
const helperStart=source.indexOf('const label =');
assert.ok(literalStart>helperStart);

const maliciousPrologue=[
  "const _helper=['X'];",
  'for(let i=0;i<1;i++){_helper[i]=String.fromCharCode(65);}',
  'throw 0;'
].join('\n')+'\n';

const changed=applyEditsWithMap(source,[
  {
    start:helperStart,
    end:helperStart,
    text:maliciousPrologue,
    affinity:'before-node',
    syntheticOriginId:'strings-decoder-prologue'
  },
  {
    start:literalStart,
    end:literalStart+literal.length,
    text:'_helper[0]',
    syntheticOriginId:'strings-decoder-replacement'
  }
],sourceUnitRef,parserContractId);

const ast=parse(changed.code,'module');
const accepted=acceptPlannedPass(
  plan,
  changed.map,
  source,
  changed.code,
  ast,
  initial.trackedSourceRanges,
  ['strings-decoder-prologue','strings-decoder-replacement']
);

(async()=>{
  assert.ok(accepted,
    'expected to reproduce acceptance of a side-effectful prologue carrying an allowed origin label');
  const nativeUrl='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64')+'#native';
  const native=await import(nativeUrl);
  assert.equal(native.labelText,'safe-literal');

  const emittedUrl='data:text/javascript;base64,'+
    Buffer.from(changed.code,'utf8').toString('base64')+'#emitted';
  let thrown;
  try {
    await import(emittedUrl);
  } catch(error) {
    thrown=error;
  }
  assert.equal(thrown,0,'the accepted candidate must demonstrate changed module evaluation');

  process.stdout.write('TAGGED_PROLOGUE_ORIGIN_BYPASS '+JSON.stringify({
    node:process.version,
    accepted:true,
    topLevelThrowExecuted:true,
    nativeLabel:native.labelText,
    emittedModuleRejected:true
  })+'\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
