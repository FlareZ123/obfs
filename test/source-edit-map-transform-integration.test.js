'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,walk}=require('../src/ast');
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
    'const aVeryLongUnusedBindingName=1;',
    "const callback=()=>{const privateInsideCallback=2;return 'inside-callback-literal';};",
    'queueMicrotask(callback);',
    "const unrelated='top-level-literal';"
  ].join('\n');
  const originalAst=parse(source,'module');
  const originalCallback=findCallback(originalAst);
  const originalCallbackSource=source.slice(originalCallback.start,originalCallback.end);
  const originalSpan=sourceSpan(source,UNIT,originalCallback.start,originalCallback.end,
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
