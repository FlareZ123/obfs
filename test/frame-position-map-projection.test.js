'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,walk}=require('../src/ast');
const {
  parserContractIdFor,applyEditsWithMap,mapSourceSpan,sourceGenerationOf
}=require('../src/source-edit-map');

const UNIT='unit:frame-position-fixture:response-1';
const PARSER=parserContractIdFor('commonjs');

/**
 * @typedef {Object} FramePositionEntry
 * @property {string} callSiteRefKey Stable callsite identity retained across generations.
 * @property {string} sourceUnitRef
 * @property {string} fromGeneration
 * @property {string} toGeneration
 * @property {string} originalSpanId
 * @property {string} currentSpanId
 * @property {{line:number,column:number}} originalPosition
 * @property {{line:number,column:number}} finalPosition
 */

/** @param {string} source @param {number} offset */
function positionAt(source,offset){
  const prefix=source.slice(0,offset);
  const lineStart=prefix.lastIndexOf('\n')+1;
  return {line:prefix.split('\n').length,column:prefix.length-lineStart};
}

/**
 * The fixture's CallSiteRefKey is semantic (the numeric receiver of Array#map),
 * not a textual marker or a generation-specific source offset.
 * @param {import('../src/ast').AstNode} ast
 */
function collectCallSites(ast){
  /** @type {{id:string,node:import('../src/ast').AstNode}[]} */
  const sites=[];
  walk(ast,node=>{
    if(node.type!=='CallExpression'||node.callee?.type!=='MemberExpression'||
       node.callee.computed||node.callee.property.type!=='Identifier'||
       node.callee.property.name!=='map'||node.callee.object.type!=='ArrayExpression'||
       node.callee.object.elements.length!==1)return;
    const receiver=node.callee.object.elements[0];
    if(receiver?.type!=='Literal'||!Number.isInteger(receiver.value))return;
    sites.push({id:UNIT+'#array-map:'+receiver.value,node});
  });
  return sites.sort((a,b)=>a.node.start-b.node.start);
}

/**
 * Rebuild the generation-specific span while retaining the stable callsite key
 * in the caller's association table.
 * @param {string} callSiteRefKey
 * @param {string} source
 * @param {import('../src/ast').AstNode} node
 */
function spanFor(callSiteRefKey,source,node){
  const generation=sourceGenerationOf(source,PARSER);
  return {
    spanId:UNIT+':'+generation+':'+callSiteRefKey+':'+node.start+':'+node.end,
    sourceUnitRef:UNIT,
    sourceGeneration:generation,
    startOffset:node.start,
    endOffset:node.end,
    coordinateUnit:'utf16-code-unit',
    astNodeType:node.type
  };
}

/** @param {string} source */
function run(source){
  const sandbox={module:{exports:{}}};
  vm.runInNewContext(source,sandbox);
  return sandbox.module.exports(()=>{});
}

const source=[
  'const other={unrelatedField:2};',
  'function hidden(external){',
  "const owner={longPrivatePropertyName:1};const astral1='😀';[1].map(function(value){external();return value;});const owner2={tinyKey:0};const astral2='😀';"+' '.repeat(40)+"[2].map(function(value){external();return value;});const owner3={anotherLongPrivatePropertyName:0};const astral3='😀';[3].map(function(value){external();return value;});",
  "const owner4={fourthLongPrivatePropertyName:0};const astral4='😀';[4].map(function(value){external();return value;});",
  'return owner.longPrivatePropertyName+owner2.tinyKey+owner3.anotherLongPrivatePropertyName+owner4.fourthLongPrivatePropertyName;}',
  'function plain(){return other.unrelatedField;}',
  'function publicReader(external){return hidden(external)+plain();}',
  'module.exports=publicReader;'
].join('\n');

test('projects stable CallSiteRef keys through source edits and signed FramePosition padding',()=>{
  const originalAst=parse(source,'commonjs');
  const originalSites=collectCallSites(originalAst);
  assert.equal(originalSites.length,4);
  assert.equal(new Set(originalSites.map(site=>site.id)).size,4);
  const originalGeneration=sourceGenerationOf(source,PARSER);
  const originalRecords=originalSites.map(site=>({
    id:site.id,
    span:spanFor(site.id,source,site.node),
    position:positionAt(source,site.node.start)
  }));

  const renamedByName=new Map([
    ['longPrivatePropertyName','_a'],
    ['tinyKey','_expandedPrivateKey'],
    ['anotherLongPrivatePropertyName','_b'],
    ['fourthLongPrivatePropertyName','_c']
  ]);
  /** @type {import('../src/ast').Edit[]} */
  const propertyEdits=[];
  walk(originalAst,node=>{
    if(node.type==='Identifier'&&renamedByName.has(node.name)){
      propertyEdits.push({
        start:node.start,end:node.end,text:renamedByName.get(node.name),
        syntheticOriginId:'fixture-property:'+node.name
      });
    }
  });
  assert.equal(propertyEdits.length,8,'each private key and member access must be edited');
  const first=applyEditsWithMap(source,propertyEdits,UNIT,PARSER);
  assert.equal(run(source),3);
  assert.equal(run(first.code),3,'property edit control must preserve execution');

  const firstAst=parse(first.code,'commonjs');
  const firstSites=collectCallSites(firstAst);
  assert.equal(firstSites.length,4);
  const firstById=new Map(firstSites.map(site=>[site.id,site]));
  const firstRanges=new Map();
  for(const original of originalRecords){
    const mapped=mapSourceSpan(first.map,original.span,source,first.code);
    assert.ok(mapped,'callsite must survive edits outside its source span');
    assert.equal(mapped.originSpanId,original.span.spanId);
    const current=firstById.get(original.id);
    assert.ok(current,'stable CallSiteRef key must resolve after reparse');
    assert.deepEqual(
      [mapped.startOffset,mapped.endOffset],
      [current.node.start,current.node.end]
    );
    firstRanges.set(original.id,{
      span:spanFor(original.id,first.code,current.node),
      position:positionAt(first.code,current.node.start)
    });
  }

  const sourceDeltas=originalRecords.map((original,index)=>
    original.position.column-firstRanges.get(original.id).position.column);
  assert.deepEqual(sourceDeltas,[21,9,37,27],
    'shrink, short-key expansion, later shrink, and separate-line shrink are all measured');
  assert.equal(originalRecords[0].position.line,originalRecords[1].position.line);
  assert.equal(originalRecords[1].position.line,originalRecords[2].position.line);
  assert.notEqual(originalRecords[2].position.line,originalRecords[3].position.line);

  // Signed prefix corrections are line-local. The second correction is
  // negative because the short-key expansion follows the first insertion.
  const corrections=[
    sourceDeltas[0],
    sourceDeltas[1]-sourceDeltas[0],
    sourceDeltas[2]-sourceDeltas[1],
    sourceDeltas[3]
  ];
  assert.deepEqual(corrections,[21,-12,28,27]);
  const second=firstById.get(originalRecords[1].id);
  assert.ok(second);
  let reserveStart=second.node.start;
  while(reserveStart>0&&first.code[reserveStart-1]===' ')reserveStart-=1;
  assert.ok(second.node.start-reserveStart>=-corrections[1],
    'negative correction must consume only a proven whitespace reserve');

  /** @type {import('../src/ast').Edit[]} */
  const paddingEdits=[
    {
      start:firstById.get(originalRecords[0].id).node.start,
      end:firstById.get(originalRecords[0].id).node.start,
      text:' '.repeat(corrections[0]),
      affinity:'before-node',
      syntheticOriginId:'frame-position-padding:'+originalRecords[0].id
    },
    {
      start:second.node.start+corrections[1],
      end:second.node.start,
      text:'',
      syntheticOriginId:'frame-position-reserve:'+originalRecords[1].id
    },
    {
      start:firstById.get(originalRecords[2].id).node.start,
      end:firstById.get(originalRecords[2].id).node.start,
      text:' '.repeat(corrections[2]),
      affinity:'before-node',
      syntheticOriginId:'frame-position-padding:'+originalRecords[2].id
    },
    {
      start:firstById.get(originalRecords[3].id).node.start,
      end:firstById.get(originalRecords[3].id).node.start,
      text:' '.repeat(corrections[3]),
      affinity:'before-node',
      syntheticOriginId:'frame-position-padding:'+originalRecords[3].id
    }
  ];
  const padded=applyEditsWithMap(first.code,paddingEdits,UNIT,PARSER);
  assert.equal(run(padded.code),3,'padding must preserve executable behavior');

  const paddedAst=parse(padded.code,'commonjs');
  const paddedSites=collectCallSites(paddedAst);
  const paddedById=new Map(paddedSites.map(site=>[site.id,site]));
  const finalGeneration=sourceGenerationOf(padded.code,PARSER);
  /** @type {Map<string,FramePositionEntry>} */
  const framePositionMap=new Map();
  for(const original of originalRecords){
    const current=firstById.get(original.id);
    const currentSpan=firstRanges.get(original.id).span;
    const relocated=mapSourceSpan(
      padded.map,currentSpan,first.code,padded.code
    );
    assert.ok(relocated,'callsite must survive the padding pass');
    assert.equal(relocated.originSpanId,currentSpan.spanId);
    const finalSite=paddedById.get(original.id);
    assert.ok(finalSite,'stable CallSiteRef key must resolve in final AST');
    assert.deepEqual(
      [relocated.startOffset,relocated.endOffset],
      [finalSite.node.start,finalSite.node.end]
    );
    const finalPosition=positionAt(padded.code,finalSite.node.start);
    framePositionMap.set(original.id,Object.freeze({
      callSiteRefKey:original.id,
      sourceUnitRef:UNIT,
      fromGeneration:originalGeneration,
      toGeneration:finalGeneration,
      originalSpanId:original.span.spanId,
      currentSpanId:currentSpan.spanId,
      originalPosition:original.position,
      finalPosition
    }));
  }
  assert.equal(framePositionMap.size,4);
  for(const entry of framePositionMap.values()){
    assert.deepEqual(entry.finalPosition,entry.originalPosition,
      'stable callsite identity must end at the original UTF-16 line/column');
  }
  assert.deepEqual([...framePositionMap.keys()],originalRecords.map(record=>record.id));
});

test('newline prologue maps source spans but invalidates FramePosition line equality',()=>{
  const ast=parse(source,'commonjs');
  const site=collectCallSites(ast)[0];
  const originalSpan=spanFor(site.id,source,site.node);
  const originalPosition=positionAt(source,site.node.start);
  const result=applyEditsWithMap(source,[
    {
      start:0,end:0,text:'const _syntheticHelper=0;\n',
      affinity:'before-node',syntheticOriginId:'synthetic-helper-prologue'
    }
  ],UNIT,PARSER);
  const mapped=mapSourceSpan(result.map,originalSpan,source,result.code);
  assert.ok(mapped,'ExactSource range can still relocate through a prologue');
  const currentPosition=positionAt(result.code,mapped.startOffset);
  assert.notEqual(currentPosition.line,originalPosition.line,
    'FramePosition must separately detect the inserted line');
  assert.notDeepEqual(currentPosition,originalPosition,
    'a span map is not a FramePosition preservation proof');
});
