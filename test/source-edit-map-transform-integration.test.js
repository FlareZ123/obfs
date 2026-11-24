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

/** @param {string} sourceUnitRef @param {number} start @param {number} end @param {string} generation */
function sourceSpan(sourceUnitRef,start,end,generation) {
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


/** @param {import('../src/ast').AstNode} ast @param {string} name */
function findNamedFunction(ast,name) {
  /** @type {import('../src/ast').AstNode|null} */
  let found=null;
  walk(ast,node=>{
    if(node.type==='FunctionDeclaration'&&node.id?.name===name)found=node;
  });
  if(!found)throw new Error('named function declaration not found: '+name);
  return found;
}

test('SNO host-held callback source survives mapped identifier edits and string prologue while unrelated literal encodes',()=>{
  const source=[
    'const aVeryLongUnusedBindingName=1;',
    "const callback=()=>{const privateInsideCallback=2;return 'inside-callback-literal';};",
    'queueMicrotask(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const originalAst=parse(source,'module');
  const originalCallback=findCallback(originalAst);
  const originalCallbackSource=source.slice(originalCallback.start,originalCallback.end);
  const originalSpan=sourceSpan(UNIT,originalCallback.start,originalCallback.end,
    sourceGenerationOf(source,PARSER));

  const renamed=renameLocalIdentifiers(source,originalAst,{
    seed:'source-map-integration-identifiers',
    sourceType:'module',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[originalSpan]
  });
  assert.ok(renamed.bindings>0,'fixture must exercise an identifier rewrite before the callback');
  assert.ok(renamed.editMap,'identifier pass must emit a generation-qualified map');
  assert.notEqual(renamed.code,source);
  assert.ok(renamed.code.includes('privateInsideCallback'),
    'identifier inside the observed callable must remain byte-for-byte unchanged');
  assert.ok(!renamed.code.includes('aVeryLongUnusedBindingName'),
    'unrelated identifier outside the callable should still be renamed');

  const relocated=mapSourceSpan(renamed.editMap,originalSpan,source,renamed.code);
  assert.ok(relocated,'callback span must survive unrelated identifier edits');
  const renamedAst=parse(renamed.code,'module');
  const renamedCallback=findCallback(renamedAst);
  assert.equal(renamedCallback.start,relocated.startOffset);
  assert.equal(renamedCallback.end,relocated.endOffset);
  assert.equal(renamed.code.slice(relocated.startOffset,relocated.endOffset),originalCallbackSource);

  // Reparse and rebuild a current-generation SourceSpanRef before the next pass.
  const currentSpan=sourceSpan(UNIT,renamedCallback.start,renamedCallback.end,
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

  const finalRange=mapSourceSpan(encoded.editMap,currentSpan,renamed.code,encoded.code);
  assert.ok(finalRange,'callback span must survive decoder prologue and unrelated literal edit');
  assert.equal(encoded.code.slice(finalRange.startOffset,finalRange.endOffset),originalCallbackSource);

  // The SNO host controls queueMicrotask and reads Function#toString at handoff.
  let observedSource=null;
  vm.runInNewContext(encoded.code,{
    queueMicrotask(callback){observedSource=callback.toString();}
  });
  assert.equal(observedSource,originalCallbackSource);
});


test('identifier protection is binding-wide across declarations and references',()=>{
  const fixtures=[
    {
      source:[
        'const unrelatedVeryLongBindingName=1;',
        'function callback(){const privateLocal=79;return privateLocal;}',
        'queueMicrotask(callback);'
      ].join('\n'),
      protectedName:'privateLocal'
    },
    {
      source:[
        'const privateOuter=79;',
        'const unrelatedVeryLongBindingName=1;',
        'function callback(){return privateOuter;}',
        'queueMicrotask(callback);'
      ].join('\n'),
      protectedName:'privateOuter'
    }
  ];
  for(const fixture of fixtures) {
    const ast=parse(fixture.source,'module');
    const callback=findNamedFunction(ast,'callback');
    const originalCallbackSource=fixture.source.slice(callback.start,callback.end);
    const span=sourceSpan(UNIT,callback.start,callback.end,
      sourceGenerationOf(fixture.source,PARSER));
    const renamed=renameLocalIdentifiers(fixture.source,ast,{
      seed:'protected-binding-wide-'+fixture.protectedName,
      sourceType:'module',sourceUnitRef:UNIT,parserContractId:PARSER,
      protectedSourceSpans:[span]
    });
    assert.ok(renamed.bindings>0,'unrelated binding should still be renamed');
    assert.ok(!renamed.code.includes('unrelatedVeryLongBindingName'));
    assert.ok(renamed.code.includes(fixture.protectedName),
      'a declaration or reference inside the protected closure must block the entire spelling');
    const range=mapSourceSpan(renamed.editMap,span,fixture.source,renamed.code);
    assert.ok(range);
    assert.equal(renamed.code.slice(range.startOffset,range.endOffset),originalCallbackSource);
    const context={queueMicrotask(callback){context.result=callback();}};
    vm.runInNewContext(renamed.code,context);
    assert.equal(context.result,79,'the partially renamed binding must remain executable');
  }
});

test('local property pass maps unrelated object edits and declines edits inside a protected span',()=>{
  const source=[
    'const outsideObject={veryLongPrivateKey:1};',
    'const outsideValue=outsideObject.veryLongPrivateKey;',
    'const callback=()=>{const innerObject={privateInsideCallback:2};return innerObject.privateInsideCallback;};'
  ].join('\n');
  const ast=parse(source,'module');
  const callback=findCallback(ast);
  const originalCallbackSource=source.slice(callback.start,callback.end);
  const span=sourceSpan(UNIT,callback.start,callback.end,sourceGenerationOf(source,PARSER));
  const renamed=renameLocalProperties(source,ast,{
    seed:'source-map-local-properties',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[span]
  });
  assert.equal(renamed.objects,1);
  assert.equal(renamed.properties,1);
  assert.ok(renamed.editMap);
  assert.ok(!renamed.code.includes('veryLongPrivateKey'));
  assert.ok(renamed.code.includes('privateInsideCallback'));
  const range=mapSourceSpan(renamed.editMap,span,source,renamed.code);
  assert.ok(range);
  assert.equal(renamed.code.slice(range.startOffset,range.endOffset),originalCallbackSource);
});

test('unrecognized external host callback source is mutable without a plan (red control)',()=>{
  const source=[
    "const callback=()=>{return 'inside-callback-literal';};",
    'queueMicrotask(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const ast=parse(source,'module');
  const originalCallback=findCallback(ast);
  const originalCallbackSource=source.slice(originalCallback.start,originalCallback.end);
  const encoded=encodeStrings(source,ast,{seed:'unprotected-host-callback-red-control'});
  assert.equal(encoded.count,2,
    'the external queueMicrotask observer is not visible to source-only heuristics');
  let observedSource=null;
  vm.runInNewContext(encoded.code,{
    queueMicrotask(callback){observedSource=callback.toString();}
  });
  assert.notEqual(observedSource,originalCallbackSource,
    'the host can observe changed callback source when no plan protects it');
});

test('direct Function.prototype.toString observer remains fail-closed without a validated plan',()=>{
  const source=[
    'const outsideObject={veryLongPrivateKey:1};',
    'const outsideValue=outsideObject.veryLongPrivateKey;',
    'const aVeryLongUnusedBindingName=1;',
    "const callback=()=>{const innerObject={privateInsideCallback:2};return 'private-literal'+innerObject.privateInsideCallback;};",
    'globalThis.observedCallbackSource=Function.prototype.toString.call(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const ast=parse(source,'module');
  assert.equal(observesFunctionSource(ast),true);
  const callback=findCallback(ast);
  const originalCallbackSource=source.slice(callback.start,callback.end);
  const span=sourceSpan(UNIT,callback.start,callback.end,sourceGenerationOf(source,PARSER));

  const blockedProperties=renameLocalProperties(source,ast,{
    seed:'direct-observer-blocked-properties',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[span]
  });
  const blockedIdentifiers=renameLocalIdentifiers(source,ast,{
    seed:'direct-observer-blocked-identifiers',sourceType:'module',
    sourceUnitRef:UNIT,parserContractId:PARSER,protectedSourceSpans:[span]
  });
  const blockedStrings=encodeStrings(source,ast,{
    seed:'direct-observer-blocked-strings',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[span]
  });
  assert.equal(blockedProperties.objects,0);
  assert.equal(blockedIdentifiers.bindings,0);
  assert.equal(blockedStrings.count,0);
  assert.equal(blockedProperties.code,source);
  assert.equal(blockedIdentifiers.code,source);
  assert.equal(blockedStrings.code,source);

  // A caller-supplied boolean is not a proof of complete sink coverage.
  assert.throws(()=>renameLocalProperties(source,ast,{
    seed:'untrusted-coverage-properties',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[span],sourceObserverCoverageComplete:true
  }),/Raw source-observer coverage booleans are unsupported/);
  assert.throws(()=>renameLocalIdentifiers(source,ast,{
    seed:'untrusted-coverage-identifiers',sourceType:'module',
    sourceUnitRef:UNIT,parserContractId:PARSER,protectedSourceSpans:[span],
    sourceObserverCoverageComplete:true
  }),/Raw source-observer coverage booleans are unsupported/);
  assert.throws(()=>encodeStrings(source,ast,{
    seed:'untrusted-coverage-strings',sourceUnitRef:UNIT,parserContractId:PARSER,
    protectedSourceSpans:[span],sourceObserverCoverageComplete:true
  }),/Raw source-observer coverage booleans are unsupported/);

  const context={};
  vm.runInNewContext(source,context);
  assert.equal(context.observedCallbackSource,originalCallbackSource);
});

test('string consumer fails closed on stale protected source generations',()=>{
  const source="const callback=()=>{return 'private-literal';};";
  const ast=parse(source,'module');
  const callback=findCallback(ast);
  const stale=sourceSpan(UNIT,callback.start,callback.end,'stale-generation');
  assert.throws(()=>encodeStrings(source,ast,{
    seed:'stale-protected-span',
    sourceUnitRef:UNIT,
    parserContractId:PARSER,
    protectedSourceSpans:[stale]
  }),/stale or foreign protected source span/);
});
