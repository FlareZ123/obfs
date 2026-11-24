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
  advancePlanRanges,
  validatePlanConsumerInput,
  validatePlanSemantics,
  acceptPlannedPass
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
  assert.deepEqual(effect.observationEffects,['ExactSource','UnknownHostEffect'],
    'an unverified host intrinsic must retain the explicit unknown-effect fallback');
  assert.ok(effect.resultValueRef,'the host effect result must be distinct from its callable input');
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
  assert.equal(ranges.trackedSourceRanges.length,4);
  assert.equal(ranges.protectedSourceRanges.length,4);
  assert.equal(ranges.protectedSourceRanges[0].originSpanId,callableSpan.spanId,
    'only the separate MappedSourceRange carries original-span provenance');
  const mirrorRead=plan.sourceMirrorReadEdges.values().next().value;
  assert.notEqual(mirrorRead.observedValueRef,effect.resultValueRef,
    'the callable input and returned source string are different values');
  assert.equal(plan.values.has(effect.resultValueRef),true);
  const resultFact=plan.valueFacts.get(effect.resultValueRef);
  assert.equal(resultFact.proofStatus,'unknown',
    'unverified host dispatch must not be represented as a proven primitive result');
  assert.deepEqual(resultFact.categoryPossibilities,['Primitive','Unknown']);
  const flowEdges=[...plan.valueFlowEdges.values()];
  assert.deepEqual(flowEdges.map(edge=>edge.kind).sort(),['assignment','export']);
  const assignment=flowEdges.find(edge=>edge.kind==='assignment');
  const exported=flowEdges.find(edge=>edge.kind==='export');
  assert.equal(assignment.fromValueRef,effect.resultValueRef);
  assert.equal(exported.fromValueRef,assignment.toValueRef);
  assert.equal(plan.values.has(exported.toValueRef),true);
  validatePlanConsumerInput(plan,source,sourceUnitRef,parserContractId,
    ranges.protectedSourceRanges);
  assert.throws(()=>validatePlanConsumerInput(plan,source,sourceUnitRef,parserContractId,[]),
    /incomplete protected source coverage/u);
});

test('rebind validator rejects the pinned source-observer counterexamples',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const initial=getInitialPlanRanges(plan,sourceUnitRef);
  const callable=[...plan.sourceSpans.values()].find(span=>
    span.astNodeType==='FunctionDeclaration');
  assert.ok(callable);

  const check=(name,edits)=>{
    const changed=applyEditsWithMap(source,edits,sourceUnitRef,parserContractId);
    const ast=parse(changed.code,'module');
    const next=advancePlanRanges(plan,changed.map,source,changed.code,
      initial.trackedSourceRanges);
    const accepted=next?validatePlanSemantics(plan,changed.code,ast,next,changed.map):false;
    assert.equal(accepted,false,name+' must fail closed');
    if(name!=='exported-mirror-overwrite') {
      assert.ok(next,name+' should preserve mappable original spans before semantic rejection');
    }
  };

  check('export-prefix',[{
    start:callable.startOffset,end:callable.startOffset,
    text:'export ',affinity:'before-node'
  }]);
  check('class-Function-shadow',[{
    start:0,end:0,text:'class Function {}\n',affinity:'unknown'
  }]);
  check('import-Function-shadow',[{
    start:0,end:0,text:"import Function from './fake-function.mjs';\n",affinity:'unknown'
  }]);
  check('appended-second-reader',[{
    start:source.length,end:source.length,
    text:'\nfunction secret() { return 99; }\n'+
      'export const leaked = Function.prototype.toString.call(secret);',
    affinity:'unknown'
  }]);
  check('intrinsic-toString-mutation',[{
    start:0,end:0,
    text:"Function.prototype.toString = function () { return 'tampered'; };\n",
    affinity:'unknown'
  }]);
  check('destructured-Function-shadow',[{
    start:0,end:0,
    text:'const {Function} = {Function: function () { return 1; }};\n',
    affinity:'unknown'
  }]);
  check('top-global-root-alias',[{
    start:0,end:0,text:"top['Function'].prototype.toString = 0;\n",affinity:'unknown'
  }]);
  check('document-defaultView-global-root-alias',[{
    start:0,end:0,
    text:"document.defaultView['Function'].prototype.toString = 0;\n",
    affinity:'unknown'
  }]);
  check('catch-binding-does-not-hide-global-root',[{
    start:0,end:0,
    text:"try {} catch (top) {}\ntop['Function'].prototype.toString = 0;\n",
    affinity:'unknown'
  }]);
  check('loop-binding-does-not-hide-global-root',[{
    start:0,end:0,
    text:"for (let top of []) {}\ntop['Function'].prototype.toString = 0;\n",
    affinity:'unknown'
  }]);
  check('String-constructor-dynamic-code',[{
    start:0,end:0,
    text:"String.constructor('top[Function]')();\n",
    affinity:'unknown'
  }]);
  check('constructor-chain-prototype-mutation',[{
    start:0,end:0,
    text:"({}).constructor.constructor.prototype.toString = 0;\n",
    affinity:'unknown'
  }]);
  check('computed-constructor-chain-prototype-mutation',[{
    start:0,end:0,
    text:"({})['constructor']['constructor'].prototype.toString = 0;\n",
    affinity:'unknown'
  }]);
  const readerCallStart=source.indexOf('const observedSource = Function.prototype.toString.call(observed);');
  assert.ok(readerCallStart>=0);
  check('callable-binding-write',[{
    start:readerCallStart,end:readerCallStart,
    text:'observed = function replacement() { return 0; };\n',
    affinity:'unknown'
  }]);
  const readerDeclarationStart=source.indexOf('const observedSource');
  const sourceTextExportStart=source.indexOf('export const sourceText = observedSource;');
  assert.ok(readerDeclarationStart>=0&&sourceTextExportStart>=0);
  check('mutable-reader-binding',[
    {
      start:readerDeclarationStart,end:readerDeclarationStart+'const'.length,
      text:'let',affinity:'unknown'
    },
    {
      start:sourceTextExportStart,end:sourceTextExportStart,
      text:"observedSource = 'fake';\n",affinity:'unknown'
    }
  ]);
  check('exported-mirror-overwrite',[{
    start:sourceTextExportStart,
    end:sourceTextExportStart+'export const sourceText = observedSource;'.length,
    text:"export const sourceText = 'fake';",
    affinity:'unknown'
  }]);
});

test('acceptPlannedPass rejects a valid map that edits a protected callable',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  const callable=[...plan.sourceSpans.values()].find(span=>
    span.astNodeType==='FunctionDeclaration');
  assert.ok(callable);
  const original=source.slice(callable.startOffset,callable.endOffset);
  const replacement=original.replace('return 29;','return 30;');
  assert.notEqual(replacement,original);
  const changed=applyEditsWithMap(source,[{
    start:callable.startOffset,end:callable.endOffset,text:replacement,affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  assert.ok(changed.map,'the synthetic edit map itself is valid');
  assert.equal(acceptPlannedPass(plan,changed.map,source,changed.code,
    parse(changed.code,'module'),ranges.trackedSourceRanges),null,
    'a valid source map cannot authorize replacement of a protected callable span');
});

test('core rolls back a rejected mapped property pass and continues safe passes',async()=>{
  const corePath=require.resolve('../src/core');
  const propertiesPath=require.resolve('../src/properties');
  const originalCoreModule=require.cache[corePath];
  const propertiesModule=require.cache[propertiesPath];
  assert.ok(originalCoreModule&&propertiesModule);
  const originalPropertiesExports=propertiesModule.exports;
  const originalRename=originalPropertiesExports.renameLocalProperties;
  /** @type {typeof originalRename} */
  const rejectingRename=(code,ast,options)=>{
    const start=code.indexOf('function observed()');
    const close=code.indexOf('}',start);
    assert.ok(start>=0&&close>start);
    const end=close+1;
    const original=code.slice(start,end);
    const replacement=original.replace('return 29;','return 30;');
    assert.notEqual(replacement,original);
    const changed=applyEditsWithMap(code,[{
      start,end,text:replacement,affinity:'unknown'
    }],options.sourceUnitRef,options.parserContractId);
    return {code:changed.code,objects:1,properties:1,editMap:changed.map};
  };
  try {
    propertiesModule.exports={
      ...originalPropertiesExports,
      renameLocalProperties:rejectingRename
    };
    delete require.cache[corePath];
    const freshCore=require('../src/core');
    const transformed=freshCore.obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{
      mode:'coo',seed:'source-observer-rollback-test',strings:true,
      experimentalSourceObservationPlan:hostContract
    }).files[0];
    assert.equal(transformed.metrics.properties,0,
      'the invalid property pass must be rolled back');
    assert.ok(transformed.metrics.bindings>=1,
      'later safe identifier rewriting must still run');
    assert.ok(transformed.metrics.literals>=1,
      'later safe string decoding must still run');
    const dataUrl=(code,tag)=>'data:text/javascript;base64,'+
      Buffer.from(code,'utf8').toString('base64')+'#rollback-'+tag;
    const native=await import(dataUrl(source,'native'));
    const emitted=await import(dataUrl(transformed.code,'emitted'));
    assert.deepEqual({
      result:emitted.result,sourceText:emitted.sourceText,labelText:emitted.labelText
    },{
      result:native.result,sourceText:native.sourceText,labelText:native.labelText
    },'rollback must preserve native module exports');
  } finally {
    propertiesModule.exports=originalPropertiesExports;
    if(originalCoreModule)require.cache[corePath]=originalCoreModule;
    else delete require.cache[corePath];
  }
});

test('source-plan transaction accepts mapped-range arrays and rejects Map impostors',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  const identity=applyEditsWithMap(source,[],sourceUnitRef,parserContractId);
  const accepted=acceptPlannedPass(plan,identity.map,source,identity.code,
    parse(identity.code,'module'),ranges.trackedSourceRanges);
  assert.ok(accepted,'the core pipeline supplies the same mapped-range array returned by getInitialPlanRanges');
  assert.ok(Array.isArray(accepted.trackedRanges));
  assert.equal(accepted.trackedRanges.length,plan.sourceSpans.size);
  assert.equal(acceptPlannedPass(plan,identity.map,source,identity.code,
    parse(identity.code,'module'),new Map()),null,
    'a Map is not the canonical transaction range representation');
});

test('producer refuses a disconnected exported source mirror',()=>{
  const disconnected=source.replace(
    'export const sourceText = observedSource;',
    "export const sourceText = 'fake';"
  );
  assert.notEqual(disconnected,source);
  assert.equal(buildDirectFunctionSourcePlan(disconnected,'entry.mjs',hostContract),null,
    'the exported mirror must receive the exact result of the direct source reader');
});

test('post-plan export overwrite invalidates the tracked source-result path',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  const original='export const sourceText = observedSource;';
  const start=source.indexOf(original);
  assert.ok(start>=0);
  const changed=applyEditsWithMap(source,[{
    start,end:start+original.length,text:"export const sourceText = 'fake';"
  }],sourceUnitRef,parserContractId);
  const next=advancePlanRanges(plan,changed.map,source,changed.code,ranges.trackedSourceRanges);
  assert.equal(next,null,
    'the exported mirror VariableDeclarator is part of the immutable semantic closure');
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
  assert.equal(mapMappedSourceRange(second.map,{
    ...firstRange,sourceGeneration:'stale-generation'
  },first.code,second.code),null,'non-adjacent generations must not compose');
  assert.equal(mapMappedSourceRange(second.map,{
    ...firstRange,sourceUnitRef:'unit:foreign'
  },first.code,second.code),null,'foreign source units must not compose');
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

test('source plan snapshots caller-controlled host-contract getters exactly once',()=>{
  const reads={runtimeFamily:0,runtimeVersion:0,contractVersion:0,pristineIntrinsicsPremise:0};
  const values={...hostContract};
  const getterContract={};
  for(const key of Object.keys(reads)) {
    Object.defineProperty(getterContract,key,{
      enumerable:true,
      get() {
        reads[key]++;
        return reads[key]===1?values[key]:'mutated-after-first-read';
      }
    });
  }
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',getterContract);
  const plainPlan=buildDirectFunctionSourcePlan(source,'entry.mjs',values);
  assert.ok(plan);
  assert.ok(plainPlan);
  assert.deepEqual(reads,{
    runtimeFamily:1,runtimeVersion:1,contractVersion:1,pristineIntrinsicsPremise:1
  });
  const [hostContractId,stored]=[...plan.hostContracts.entries()][0];
  const [plainHostContractId]=[...plainPlan.hostContracts.keys()];
  assert.equal(stored.runtimeFamily,values.runtimeFamily);
  assert.equal(stored.runtimeVersion,values.runtimeVersion);
  assert.equal(stored.contractVersion,values.contractVersion);
  assert.equal(stored.pristineIntrinsicsPremise,values.pristineIntrinsicsPremise);
  assert.equal(hostContractId,plainHostContractId,
    'the identity must be derived from the same immutable values recorded in HostContractRef');
  assert.equal(plan.planGeneration,plainPlan.planGeneration);
});

test('source-plan consumers reject copied mapped ranges with forged offsets',()=>{
  const stringCallableSource=[
    "function observed() { return 'source-visible-literal'; }",
    'const observedSource = Function.prototype.toString.call(observed);',
    'export const sourceText = observedSource;'
  ].join('\n');
  const plan=buildDirectFunctionSourcePlan(stringCallableSource,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const ranges=getInitialPlanRanges(plan,sourceUnitRef);
  assert.equal(validatePlanConsumerInput(
    plan,stringCallableSource,sourceUnitRef,parserContractId,ranges.protectedSourceRanges
  ),true);
  const valid=ranges.protectedSourceRanges[0];
  const forged=Object.freeze({...valid,startOffset:0,endOffset:1});
  assert.throws(()=>validatePlanConsumerInput(
    plan,stringCallableSource,sourceUnitRef,parserContractId,[forged]
  ),/untrusted.*protected source range/u);
  const ast=parse(stringCallableSource,'module');
  assert.throws(()=>encodeStrings(stringCallableSource,ast,{
    seed:'forged-range',sourceType:'module',sourceUnitRef,parserContractId,
    sourceObservationPlan:plan,protectedSourceRanges:[forged],minimumStringLength:4
  }),/untrusted.*protected source range/u);
  const identity=applyEditsWithMap(stringCallableSource,[],sourceUnitRef,parserContractId);
  const forgedTracked=ranges.trackedSourceRanges.map(range=>
    Object.freeze({...range,startOffset:0,endOffset:1}));
  assert.equal(advancePlanRanges(
    plan,identity.map,stringCallableSource,identity.code,forgedTracked
  ),null,'a forged tracked range must not be advanced into a trusted capability');
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


test('independent review: post-pass constructor-chain intrinsic writes are refused',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const initial=getInitialPlanRanges(plan,sourceUnitRef);
  for(const [name,text] of [
    ['direct',"({}).constructor.constructor.prototype.toString = 0;"],
    ['computed',"({})['constructor']['constructor'].prototype.toString = 0;"]
  ]) {
    const changed=applyEditsWithMap(source,[{
      start:source.length,end:source.length,text:'\n'+text+'\n',affinity:'unknown'
    }],sourceUnitRef,parserContractId);
    const ast=parse(changed.code,'module');
    const next=advancePlanRanges(plan,changed.map,source,changed.code,initial.trackedSourceRanges);
    assert.ok(next,name+': the original protected spans should remain mappable');
    assert.equal(validatePlanSemantics(plan,changed.code,ast,next,changed.map),false,
      name+': post-pass prototype mutation must be rejected');
  }
});


test('independent review: untagged top-level throw is rejected as an arbitrary post-pass insertion',()=>{
  const plan=buildDirectFunctionSourcePlan(source,'entry.mjs',hostContract);
  assert.ok(plan);
  const sourceUnitRef=plan.sourceUnits.keys().next().value;
  const parserContractId=parserContractIdFor('module');
  const initial=getInitialPlanRanges(plan,sourceUnitRef);
  const changed=applyEditsWithMap(source,[{
    start:0,end:0,text:'throw 0;\n',affinity:'unknown'
  }],sourceUnitRef,parserContractId);
  const ast=parse(changed.code,'module');
  const next=advancePlanRanges(plan,changed.map,source,changed.code,initial.trackedSourceRanges);
  assert.ok(next,'the protected spans remain exactly mappable');
  assert.equal(validatePlanSemantics(plan,changed.code,ast,next,changed.map),false,
    'a pass must not be able to change module evaluation by inserting an untagged top-level throw');
});
