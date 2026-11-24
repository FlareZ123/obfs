'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,walk,observesFunctionSource}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');
const {renameLocalIdentifiers}=require('../src/identifiers');
const {encodeStrings}=require('../src/strings');
const {parserContractIdFor,mapSourceSpan,sourceGenerationOf}=require('../src/source-edit-map');

const UNIT='unit:sno:entry-module:instance-1';
const PARSER=parserContractIdFor('module');

/** @param {string} source @param {string} sourceUnitRef @param {number} start @param {number} end @param {string} generation */
function sourceSpan(source,sourceUnitRef,start,end,generation) {
  return {
    spanId:sourceUnitRef+':'+generation+':'+start+':'+end,
    sourceUnitRef,sourceGeneration:generation,
    startOffset:start,endOffset:end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:'ArrowFunctionExpression'
  };
}

/** @param {import('../src/ast').AstNode} ast */
function findCallback(ast) {
  /** @type {import('../src/ast').AstNode|null} */
  let found=null;
  walk(ast,node=>{
    if(node.type==='ArrowFunctionExpression')found=node;
  });
  if(!found)throw new Error('callback arrow not found');
  return found;
}

test('SNO host-held callback source survives mapped identifier edits and string prologue while unrelated literal encodes',()=>{
  const source=[
    'const outsideObject={veryLongPrivateKey:1};',
    'const outsideValue=outsideObject.veryLongPrivateKey;',
    'const aVeryLongUnusedBindingName=1;',
    "const callback=()=>{const innerObject={privateInsideCallback:2};return 'inside-callback-literal'+innerObject.privateInsideCallback;};",
    'queueMicrotask(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const originalAst=parse(source,'module');
  const originalCallback=findCallback(originalAst);
  const originalCallbackSource=source.slice(originalCallback.start,originalCallback.end);
  const originalSpan=sourceSpan(source,UNIT,originalCallback.start,originalCallback.end,
    sourceGenerationOf(source,PARSER));

  const propertyRenamed=renameLocalProperties(source,originalAst,{
    seed:'source-map-integration-properties',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[originalSpan],
    sourceObserverCoverageComplete:true // fixture's manual plan covers its only observer
  });
  assert.equal(propertyRenamed.objects,1,'only the object outside the observed callable should be renamed');
  assert.equal(propertyRenamed.properties,1);
  assert.ok(propertyRenamed.editMap,'local property pass must emit a generation-qualified map');
  assert.ok(!propertyRenamed.code.includes('veryLongPrivateKey'));
  assert.ok(propertyRenamed.code.includes('privateInsideCallback'),
    'property inside the observed callable must remain unchanged');

  const propertyRange=mapSourceSpan(propertyRenamed.editMap,originalSpan,source,propertyRenamed.code);
  assert.ok(propertyRange,'callback span must survive unrelated local-property edits');
  const propertyAst=parse(propertyRenamed.code,'module');
  const propertyCallback=findCallback(propertyAst);
  assert.equal(propertyCallback.start,propertyRange.startOffset);
  assert.equal(propertyCallback.end,propertyRange.endOffset);
  assert.equal(propertyRenamed.code.slice(propertyRange.startOffset,propertyRange.endOffset),originalCallbackSource);

  // Reparse and rebuild a current-generation SourceSpanRef before each next pass.
  const propertySpan=sourceSpan(propertyRenamed.code,UNIT,propertyCallback.start,propertyCallback.end,
    sourceGenerationOf(propertyRenamed.code,PARSER));
  const renamed=renameLocalIdentifiers(propertyRenamed.code,propertyAst,{
    seed:'source-map-integration-identifiers',
    sourceType:'module',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[propertySpan]
  });
  assert.ok(renamed.bindings>0,'fixture must exercise an identifier rewrite before the callback');
  assert.ok(renamed.editMap,'identifier pass must emit a generation-qualified map');
  assert.notEqual(renamed.code,propertyRenamed.code);
  assert.ok(renamed.code.includes('privateInsideCallback'),
    'identifier inside the observed callable must remain byte-for-byte unchanged');
  assert.ok(!renamed.code.includes('aVeryLongUnusedBindingName'),
    'unrelated identifier outside the callable should still be renamed');

  const relocated=mapSourceSpan(renamed.editMap,propertySpan,propertyRenamed.code,renamed.code);
  assert.ok(relocated,'callback span must survive unrelated identifier edits');
  const renamedAst=parse(renamed.code,'module');
  const renamedCallback=findCallback(renamedAst);
  assert.equal(renamedCallback.start,relocated.startOffset);
  assert.equal(renamedCallback.end,relocated.endOffset);
  assert.equal(renamed.code.slice(relocated.startOffset,relocated.endOffset),originalCallbackSource);

  const currentSpan=sourceSpan(renamed.code,UNIT,renamedCallback.start,renamedCallback.end,
    sourceGenerationOf(renamed.code,PARSER));
  const encoded=encodeStrings(renamed.code,renamedAst,{
    seed:'source-map-integration-strings',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[currentSpan]
  });
  assert.equal(encoded.count,1,'only the unrelated top-level string should be encoded');
  assert.ok(encoded.editMap,'string pass must include its decoder prologue in the edit map');
  assert.ok(encoded.code.includes("'inside-callback-literal'"));
  assert.ok(!encoded.code.includes("'top-level-literal'"));

  const finalRange=mapSourceSpan(encoded.editMap, currentSpan,renamed.code,encoded.code);
  assert.ok(finalRange,'callback span must survive decoder prologue and unrelated literal edit');
  assert.equal(encoded.code.slice(finalRange.startOffset,finalRange.endOffset),originalCallbackSource);

  // The SNO host controls queueMicrotask and reads Function#toString at handoff.
  let observedSource=null;
  vm.runInNewContext(encoded.code,{
    queueMicrotask(callback){observedSource=callback.toString();}
  });
  assert.equal(observedSource,originalCallbackSource);

  // Red control: without the protected span, the same encoder mutates the
  // callback's source and the hostile host can observe that mutation.
  const unprotected=encodeStrings(renamed.code,renamedAst,{
    seed:'source-map-integration-unprotected-red-control',
    sourceUnitRef:UNIT,
    parserContractId:PARSER
  });
  assert.equal(unprotected.count,2);
  let observedUnprotected=null;
  vm.runInNewContext(unprotected.code,{
    queueMicrotask(callback){observedUnprotected=callback.toString();}
  });
  assert.notEqual(observedUnprotected,originalCallbackSource);
});


test('direct Function.prototype.toString observer gets selective yield only with complete protected coverage',()=>{
  const source=[
    'const outsideObject={veryLongPrivateKey:1};',
    'const outsideValue=outsideObject.veryLongPrivateKey;',
    'const aVeryLongUnusedBindingName=1;',
    "const callback=()=>{const innerObject={privateInsideCallback:2};return 'inside-callback-literal'+innerObject.privateInsideCallback;};",
    'globalThis.observedCallbackSource=Function.prototype.toString.call(callback);',
    'queueMicrotask(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const ast=parse(source,'module');
  assert.equal(observesFunctionSource(ast),true,
    'fixture must exercise the direct in-source observer gate');
  const originalCallback=findCallback(ast);
  const originalCallbackSource=source.slice(originalCallback.start,originalCallback.end);
  const originalSpan=sourceSpan(source,UNIT,originalCallback.start,originalCallback.end,
    sourceGenerationOf(source,PARSER));

  const blockedProperties=renameLocalProperties(source,ast,{
    seed:'direct-observer-blocked-properties',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[originalSpan]
  });
  const blockedIdentifiers=renameLocalIdentifiers(source,ast,{
    seed:'direct-observer-blocked-identifiers',sourceType:'module',
    sourceUnitRef:UNIT,parserContractId:PARSER,protectedSourceSpans:[originalSpan]
  });
  const blockedStrings=encodeStrings(source,ast,{
    seed:'direct-observer-blocked-strings',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[originalSpan]
  });
  assert.equal(blockedProperties.objects,0);
  assert.equal(blockedIdentifiers.bindings,0);
  assert.equal(blockedStrings.count,0,
    'without a complete plan, all three passes must retain the conservative whole-file gate');

  const propertyRenamed=renameLocalProperties(source,ast,{
    seed:'direct-observer-covered-properties',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[originalSpan],sourceObserverCoverageComplete:true
  });
  assert.equal(propertyRenamed.objects,1);
  assert.equal(propertyRenamed.properties,1);
  assert.ok(propertyRenamed.editMap);
  const propertyRange=mapSourceSpan(propertyRenamed.editMap,originalSpan,source,propertyRenamed.code);
  assert.ok(propertyRange);
  const propertyAst=parse(propertyRenamed.code,'module');
  const propertyCallback=findCallback(propertyAst);
  assert.equal(propertyRenamed.code.slice(propertyRange.startOffset,propertyRange.endOffset),
    originalCallbackSource);
  const propertySpan=sourceSpan(propertyRenamed.code,UNIT,propertyCallback.start,propertyCallback.end,
    sourceGenerationOf(propertyRenamed.code,PARSER));

  const renamed=renameLocalIdentifiers(propertyRenamed.code,propertyAst,{
    seed:'direct-observer-covered-identifiers',sourceType:'module',
    sourceUnitRef:UNIT,parserContractId:PARSER,protectedSourceSpans:[propertySpan],
    sourceObserverCoverageComplete:true
  });
  assert.ok(renamed.bindings>0);
  const identifierRange=mapSourceSpan(renamed.editMap,propertySpan,propertyRenamed.code,renamed.code);
  assert.ok(identifierRange);
  const renamedAst=parse(renamed.code,'module');
  const renamedCallback=findCallback(renamedAst);
  assert.equal(renamed.code.slice(identifierRange.startOffset,identifierRange.endOffset),
    originalCallbackSource);
  const renamedSpan=sourceSpan(renamed.code,UNIT,renamedCallback.start,renamedCallback.end,
    sourceGenerationOf(renamed.code,PARSER));

  const encoded=encodeStrings(renamed.code,renamedAst,{
    seed:'direct-observer-covered-strings',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[renamedSpan],sourceObserverCoverageComplete:true
  });
  assert.equal(encoded.count,1);
  assert.ok(encoded.editMap);
  const finalRange=mapSourceSpan(encoded.editMap,renamedSpan,renamed.code,encoded.code);
  assert.ok(finalRange);
  assert.equal(encoded.code.slice(finalRange.startOffset,finalRange.endOffset),
    originalCallbackSource);
  assert.ok(encoded.code.includes("'inside-callback-literal'"));
  assert.ok(!encoded.code.includes("'top-level-literal'"));

  const context={queueMicrotask(callback){context.hostCallbackSource=callback.toString();}};
  vm.runInNewContext(encoded.code,context);
  assert.equal(context.observedCallbackSource,originalCallbackSource);
  assert.equal(context.hostCallbackSource,originalCallbackSource);
});

test('string consumer fails closed on stale protected source generations',()=>{
  const source="const callback=()=>{return 'private-literal';};";
  const ast=parse(source,'module');
  const callback=findCallback(ast);
  const stale=sourceSpan(source,UNIT,callback.start,callback.end,'stale-generation');
  assert.throws(()=>encodeStrings(source,ast,{
    seed:'stale-protected-span',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[stale]
  }),/stale or foreign protected source span/);
});
