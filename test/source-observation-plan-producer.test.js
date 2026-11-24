'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {parserContractIdFor,parse}=require('../src/ast');
const {renameLocalIdentifiers}=require('../src/identifiers');
const {renameLocalProperties}=require('../src/properties');
const {encodeStrings}=require('../src/strings');
const {applyEditsWithMap,mapSourceSpan,mapMappedSourceRange,sourceGenerationOf}=require('../src/source-edit-map');
const {
  buildDirectFunctionSourcePlan,
  getInitialPlanRanges,
  validatePlanConsumerInput
}=require('../src/source-observation-plan');

/** @typedef {import('../src/core').SourceFile} SourceFile */

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
    'Fresh test realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode; this is a declared compatibility premise, not an attacker-resistant guarantee.'
};

/** @param {string} code @returns {SourceFile} */
function entry(code) {
  return {path:'entry.mjs',sourceType:'module',code};
}

/** @param {string} code @returns {Promise<Record<string,unknown>>} */
async function importDataModule(code) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64');
  return /** @type {Promise<Record<string,unknown>>} */ (import(url));
}

test('direct Function#toString plan preserves exact callable source while unrelated local passes yield',async()=>{
  const native=await importDataModule(source);
  const result=obfuscateFiles([entry(source)],{
    mode:'coo',
    seed:'direct-source-plan-positive',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.notEqual(emitted.code,source);
  assert.ok(emitted.metrics.properties>=1,'unrelated private object field must be renamed');
  assert.ok(emitted.metrics.bindings>=1,'unrelated lexical bindings must be renamed');
  assert.ok(emitted.metrics.literals>=1,'unrelated string literal must be encoded');
  assert.equal(result.crossFile.properties,0,'single-file plan does not enable cross-file renaming');
  assert.doesNotMatch(emitted.code,/privateField/u);
  assert.doesNotMatch(emitted.code,/'safe-literal'/u);
  assert.ok(emitted.code.includes('function observed() { return 29; }'),
    'the observed callable source span must remain byte-for-byte present');
  const compiled=await importDataModule(emitted.code);
  assert.equal(compiled.sourceText,native.sourceText);
  assert.equal(compiled.result,native.result);
  assert.equal(compiled.labelText,native.labelText);
  assert.equal(compiled.sourceText,'function observed() { return 29; }');
});

test('without an explicit plan the existing broad observer veto remains unchanged',()=>{
  const result=obfuscateFiles([entry(source)],{
    mode:'coo',seed:'direct-source-plan-default',strings:true
  });
  assert.equal(result.files[0].code,source);
  assert.equal(result.files[0].metrics.properties,0);
  assert.equal(result.files[0].metrics.bindings,0);
  assert.equal(result.files[0].metrics.literals,0);
});


test('module-local String binding cannot be captured by the inserted decoder prologue',async()=>{
  const shadowSource=[
    '// module-local String shadow',
    'const privateRecord = { privateField: 7 };',
    'function observed() { return 29; }',
    'const observedSource = Function.prototype.toString.call(observed);',
    "const String = 'shadowed';",
    "const label = 'safe-literal';",
    'export const result = privateRecord.privateField;',
    'export const sourceText = observedSource;',
    'export const labelText = label;',
    'export const shadowValue = String;'
  ].join('\n');
  const native=await importDataModule(shadowSource);
  const result=obfuscateFiles([entry(shadowSource)],{
    mode:'coo',seed:'direct-source-plan-string-shadow',strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.ok(emitted.metrics.properties>=1);
  assert.ok(emitted.metrics.bindings>=1);
  if(emitted.metrics.literals===0) {
    assert.doesNotMatch(emitted.code,/fromCharCode/u,
      'when the String binding remains, the encoder must decline before inserting its prologue');
  } else {
    assert.doesNotMatch(emitted.code,/\b(?:const|let|var)\s+String\s*=/u,
      'if string encoding proceeds, the local String binding must have been safely renamed');
  }
  const compiled=await importDataModule(emitted.code);
  assert.equal(compiled.result,native.result);
  assert.equal(compiled.sourceText,native.sourceText);
  assert.equal(compiled.labelText,native.labelText);
  assert.equal(compiled.shadowValue,native.shadowValue);
  assert.equal(compiled.sourceText,'function observed() { return 29; }');
});

test('canonical source spans remain immutable and mapped ranges carry provenance separately',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  assert.equal(typeof sourceUnitRef,'string');
  const parserContractId=parserContractIdFor('module');
  const effect=plan.hostEffects.values().next().value;
  assert.equal(effect.effectiveDispatchStatus,'unknown-or-mutable');
  assert.equal(effect.effectiveOperationRef.kind,'unknown');
  assert.equal(effect.receiverProvenance,'unknown');
  assert.equal(effect.receiverLookupRoute,'unknown');
  assert.equal(plan.callSites.values().next().value.targetResolutionStatus,'external');
  assert.equal(plan.sourceMirrors.values().next().value.readerOperationRef.kind,'unknown');
  assert.equal(plan.hostContracts.values().next().value.intrinsicSnapshotId,null,
    'a declared premise is not a runtime intrinsic snapshot');
  const spans=[...plan.sourceSpans.values()];
  const callableSpan=spans.find(span=>span.astNodeType==='FunctionDeclaration');
  assert.ok(callableSpan);
  assert.equal(Object.isFrozen(callableSpan),true);
  assert.equal(Object.hasOwn(callableSpan,'originSpanId'),false,
    'canonical SourceSpanRef identity remains the original span ID');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  assert.equal(ranges.trackedSourceRanges.length,2);
  assert.equal(ranges.protectedSourceRanges.length,1);
  assert.equal(ranges.protectedSourceRanges[0].originSpanId,callableSpan.spanId,
    'only the separate MappedSourceRange carries original-span provenance');
  validatePlanConsumerInput(plan,source,sourceUnitRef,parserContractId,
    ranges.protectedSourceRanges);
  assert.throws(()=>validatePlanConsumerInput(plan,source,sourceUnitRef,parserContractId,[]),
    /incomplete protected source coverage/u);
});

test('producer rejects aliases, extra readers, unknown syntax and unversioned host premises',()=>{
  const alias=source.replace(
    'Function.prototype.toString.call(observed)',
    'Function.prototype.toString.call.bind(Function.prototype.toString)(observed)'
  );
  const secondReader=source.replace(
    'export const sourceText = observedSource;',
    'const secondSource = Function.prototype.toString.call(observed); export const sourceText = observedSource;'
  );
  const unknownSyntax=source.replace(
    'function observed() { return 29; }',
    'function observed() { return Math.max(29, 1); }'
  );
  const getterObject=source.replace(
    'const privateRecord = { privateField: 7 };',
    'const privateRecord = { get privateField() { return 7; } };'
  );
  const exportedObject=source.replace(
    'const privateRecord = { privateField: 7 };',
    'export const privateRecord = { privateField: 7 };'
  );
  const objectAliasEscape=source.replace(
    'const privateRecord = { privateField: 7 };',
    'const privateRecord = { privateField: 7 }; const alias = privateRecord; export const leaked = alias;'
  );
  const inheritedRead=source.replace('privateRecord.privateField','privateRecord.toString');
  const shadowedFunction=source.replace(
    'const privateRecord = { privateField: 7 };',
    'const Function = 1; const privateRecord = { privateField: 7 };'
  );
  const exportedCallable=source.replace(
    'function observed() { return 29; }',
    'export function observed() { return 29; }'
  );
  assert.equal(buildDirectFunctionSourcePlan(alias,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(secondReader,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(unknownSyntax,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(getterObject,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(exportedObject,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(objectAliasEscape,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(inheritedRead,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(shadowedFunction,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(exportedCallable,'entry.mjs',hostContract),null);
  assert.equal(buildDirectFunctionSourcePlan(source,'entry.mjs',null),null);
  assert.throws(()=>obfuscateFiles([entry(alias)],{
    mode:'coo',experimentalSourceObservationPlan:hostContract
  }),/outside the closed direct Function\.prototype\.toString\.call producer grammar/u);
});


test('MappedSourceRange composes directly through the next generation without re-minting SourceSpanRef',()=>{
  const input='const emoji = "😀";\nfunction observed() { return 29; }\nexport const marker = 1;';
  const unit='unit:direct-map-composition';
  const start=input.indexOf('function observed');
  const end=input.indexOf('\n',start);
  const originalSpan=Object.freeze({
    spanId:'span:original:function-observed',
    sourceUnitRef:unit,
    sourceGeneration:sourceGenerationOf(input,parserContractIdFor('module')),
    startOffset:start,
    endOffset:end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'FunctionDeclaration'
  });
  assert.equal(Object.hasOwn(originalSpan,'originSpanId'),false);
  const insertedAtStart=applyEditsWithMap(input,[{
    start,end:start,text:'/* before function */\n',affinity:'before-node'
  }],unit,parserContractIdFor('module'));
  const startMapped=mapSourceSpan(insertedAtStart.map,originalSpan,input,insertedAtStart.code);
  assert.ok(startMapped);
  assert.equal(insertedAtStart.code.slice(startMapped.startOffset,startMapped.endOffset),
    input.slice(originalSpan.startOffset,originalSpan.endOffset));
  const insertedAtEnd=applyEditsWithMap(input,[{
    start:end,end,text:'\n/* after function */',affinity:'after-node'
  }],unit,parserContractIdFor('module'));
  const endMapped=mapSourceSpan(insertedAtEnd.map,originalSpan,input,insertedAtEnd.code);
  assert.ok(endMapped);
  assert.equal(insertedAtEnd.code.slice(endMapped.startOffset,endMapped.endOffset),
    input.slice(originalSpan.startOffset,originalSpan.endOffset));
  const first=applyEditsWithMap(input,[{
    start:0,end:0,text:'// first prologue\n',affinity:'before-node'
  }],unit,parserContractIdFor('module'));
  const firstRange=mapSourceSpan(first.map,originalSpan,input,first.code);
  assert.ok(firstRange);
  const second=applyEditsWithMap(first.code,[{
    start:0,end:0,text:'// second prologue\n',affinity:'before-node'
  }],unit,parserContractIdFor('module'));
  const secondRange=mapMappedSourceRange(second.map,firstRange,first.code,second.code);
  assert.ok(secondRange,'the second mapper must accept the first MappedSourceRange directly');
  assert.equal(secondRange.originSpanId,originalSpan.spanId);
  assert.equal(secondRange.sourceUnitRef,unit);
  assert.equal(secondRange.sourceGeneration,second.map.toGeneration);
  assert.equal(second.code.slice(secondRange.startOffset,secondRange.endOffset),
    input.slice(originalSpan.startOffset,originalSpan.endOffset));
  const damaged=applyEditsWithMap(second.code,[{
    start:secondRange.startOffset+1,
    end:secondRange.startOffset+2,
    text:'X'
  }],unit,parserContractIdFor('module'));
  assert.equal(mapMappedSourceRange(damaged.map,secondRange,second.code,damaged.code),null,
    'a later edit intersecting the exact source closure must invalidate the range');
});


test('raw spans and structurally copied plans cannot bypass observer vetoes',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  const ast=parse(source,'module');
  const fakePlan={...plan};
  assert.throws(()=>renameLocalIdentifiers(source,ast,{
    seed:'forged-plan',sourceType:'module',sourceUnitRef,parserContractId,
    sourceObservationPlan:fakePlan,protectedSourceRanges:ranges.protectedSourceRanges
  }),/Unvalidated SourceObservationPlan/u);
  assert.throws(()=>renameLocalIdentifiers(source,ast,{
    seed:'raw-span',sourceType:'module',sourceUnitRef,parserContractId,
    protectedSourceSpans:[...plan.sourceSpans.values()]
  }),/Raw protectedSourceSpans/u);
  assert.throws(()=>renameLocalProperties(source,ast,{
    seed:'raw-span',sourceUnitRef,parserContractId,
    protectedSourceSpans:[...plan.sourceSpans.values()]
  }),/Raw protectedSourceSpans/u);
  assert.throws(()=>encodeStrings(source,ast,{
    seed:'raw-span',sourceUnitRef,parserContractId,
    protectedSourceSpans:[...plan.sourceSpans.values()]
  }),/Raw protectedSourceSpans/u);
});

test('producer remains scoped to one ESM COO unit and rejects server modes and multi-file inputs',()=>{
  assert.throws(()=>obfuscateFiles([entry(source)],{
    mode:'sno',experimentalSourceObservationPlan:hostContract
  }),/only single-file ESM COO/u);
  assert.throws(()=>obfuscateFiles([
    entry(source),
    {path:'second.mjs',sourceType:'module',code:'export const value=1;'}
  ],{
    mode:'coo',experimentalSourceObservationPlan:hostContract
  }),/only single-file ESM COO/u);
});
