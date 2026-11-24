'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parserContractIdFor,applyEditsWithMap,mapSourceSpan,sourceGenerationOf}=require('../src/source-edit-map');
const PARSER=parserContractIdFor('module');

/** @param {string} sourceUnitRef @param {string} source @param {number} start @param {number} end */
function span(sourceUnitRef,source,start,end) {
  return {
    spanId:sourceUnitRef+':'+sourceGenerationOf(source,PARSER)+':'+start+':'+end,
    sourceUnitRef,sourceGeneration:sourceGenerationOf(source,PARSER),
    startOffset:start,endOffset:end,coordinateUnit:'utf16-code-unit',
    astNodeType:start===end?null:'FunctionDeclaration'
  };
}

test('maps a protected span through edits before and after it',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:1,end:2,text:'XYZ',syntheticOriginId:'renamed-key'},
    {start:5,end:6,text:''}
  ],'unit:module.cjs:1',PARSER);
  const original=span('unit:module.cjs:1',source,2,5);
  const mapped=mapSourceSpan(result.map,original,source,result.code);
  assert.deepEqual(mapped,{
    sourceUnitRef:'unit:module.cjs:1',
    sourceGeneration:sourceGenerationOf(result.code,PARSER),
    originSpanId:original.spanId,
    startOffset:4,endOffset:7,coordinateUnit:'utf16-code-unit'
  });
  assert.equal(result.code.slice(mapped.startOffset,mapped.endOffset),
    source.slice(original.startOffset,original.endOffset));
});

test('rejects protected spans intersected by replacement or interior insertion',()=>{
  const source='abcdef';
  const replacement=applyEditsWithMap(source,[
    {start:3,end:4,text:'Q',syntheticOriginId:'property-key'}
  ],'unit:m.js:1',PARSER);
  assert.equal(mapSourceSpan(replacement.map,span('unit:m.js:1',source,2,5),source,replacement.code),null);
  const insertion=applyEditsWithMap(source,[
    {start:3,end:3,text:'Q',affinity:'before-node',syntheticOriginId:'helper'}
  ],'unit:m.js:1',PARSER);
  assert.equal(mapSourceSpan(insertion.map,span('unit:m.js:1',source,2,5),source,insertion.code),null);
});

test('requires explicit before-node affinity for insertion at a protected span start',()=>{
  const source='abcdef';
  const before=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'before-node',syntheticOriginId:'prologue'}
  ],'unit:m.js:1',PARSER);
  const mapped=mapSourceSpan(before.map,span('unit:m.js:1',source,2,4),source,before.code);
  assert.deepEqual({start:mapped?.startOffset,end:mapped?.endOffset},{start:3,end:5});
  const unknown=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',syntheticOriginId:'unclassified'}
  ],'unit:m.js:1',PARSER);
  assert.equal(mapSourceSpan(unknown.map,span('unit:m.js:1',source,2,4),source,unknown.code),null);
  const inside=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'within-node'}
  ],'unit:m.js:1',PARSER);
  assert.equal(mapSourceSpan(inside.map,span('unit:m.js:1',source,2,4),source,inside.code),null);
});

test('insertion at the half-open span end remains outside the protected source',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:4,end:4,text:'X',syntheticOriginId:'following-prologue'}
  ],'unit:m.js:1',PARSER);
  const mapped=mapSourceSpan(result.map,span('unit:m.js:1',source,2,4),source,result.code);
  assert.deepEqual({start:mapped?.startOffset,end:mapped?.endOffset},{start:2,end:4});
});

test('maps synthetic prologue insertion at an exact callable boundary',()=>{
  const source='function f(){return "private";}';
  const start=source.indexOf('function');
  const result=applyEditsWithMap(source,[
    {start,end:start,text:'const _helper=0;\n',
      affinity:'before-node',syntheticOriginId:'string-decoder-prologue'}
  ],'unit:entry.mjs:1',PARSER);
  const mapped=mapSourceSpan(result.map,span('unit:entry.mjs:1',source,start,source.length),
    source,result.code);
  assert.ok(mapped);
  assert.equal(result.code.slice(mapped.startOffset,mapped.endOffset),source.slice(start));
});

test('uses UTF-16 code-unit offsets after astral Unicode',()=>{
  const source='😀abc';
  assert.equal(source.length,5);
  const result=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'before-node',syntheticOriginId:'helper'}
  ],'unit:unicode.mjs:1',PARSER);
  const mapped=mapSourceSpan(result.map,span('unit:unicode.mjs:1',source,2,5),source,result.code);
  assert.deepEqual({start:mapped?.startOffset,end:mapped?.endOffset},{start:3,end:6});
  assert.equal(result.code.slice(mapped.startOffset,mapped.endOffset),'abc');
});

test('maps a span through a sequential chain of source generations',()=>{
  const source='0123456789';
  const first=applyEditsWithMap(source,[
    {start:1,end:2,text:'ABC',syntheticOriginId:'private-key'}
  ],'unit:entry.cjs:1',PARSER);
  const original=span('unit:entry.cjs:1',source,4,7);
  const firstSpan=mapSourceSpan(first.map,original,source,first.code);
  assert.deepEqual({start:firstSpan?.startOffset,end:firstSpan?.endOffset},{start:6,end:9});
  const second=applyEditsWithMap(first.code,[
    {start:0,end:0,text:'!',affinity:'before-node',syntheticOriginId:'banner'},
    {start:10,end:11,text:'Z',syntheticOriginId:'suffix'}
  ],'unit:entry.cjs:1',PARSER);
  const secondSpan=mapSourceSpan(second.map,span(
    'unit:entry.cjs:1',first.code,firstSpan.startOffset,firstSpan.endOffset
  ),first.code,second.code);
  assert.deepEqual({start:secondSpan?.startOffset,end:secondSpan?.endOffset},{start:7,end:10});
  assert.equal(second.code.slice(secondSpan.startOffset,secondSpan.endOffset),source.slice(4,7));
});

test('refuses stale source-unit and parser-generation identities',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:0,end:0,text:'!',affinity:'before-node'}
  ],'unit:a.mjs:1',PARSER);
  assert.equal(mapSourceSpan(result.map,span('unit:b.mjs:1',source,2,4),source,result.code),null);
  const stale=span('unit:a.mjs:1','changed',2,4);
  assert.equal(mapSourceSpan(result.map,stale,source,result.code),null);
  assert.equal(mapSourceSpan(result.map,span('unit:a.mjs:1',source,2,4),source,'tampered'),null);
  const wrongParser=sourceGenerationOf(source,parserContractIdFor('commonjs'));
  assert.notEqual(wrongParser,result.map.fromGeneration);
});

test('preserves applyEdits ordering for multiple insertions at one offset',()=>{
  const source='ab';
  const result=applyEditsWithMap(source,[
    {start:1,end:1,text:'X',affinity:'before-node',syntheticOriginId:'first'},
    {start:1,end:1,text:'Y',affinity:'before-node',syntheticOriginId:'second'}
  ],'unit:entry.js:1',PARSER);
  assert.equal(result.code,'aYXb');
  const mapped=mapSourceSpan(result.map,span('unit:entry.js:1',source,1,2),source,result.code);
  assert.deepEqual({start:mapped?.startOffset,end:mapped?.endOffset},{start:3,end:4});
  assert.equal(result.code.slice(mapped.startOffset,mapped.endOffset),'b');
  assert.deepEqual(result.map.segments.filter(x=>x.kind==='inserted')
    .map(x=>x.syntheticOriginId),['second','first']);
});

test('supports insertion at the start of a replacement while preserving exact edit order',()=>{
  const source='abcd';
  const result=applyEditsWithMap(source,[
    {start:1,end:1,text:'X',affinity:'before-node'},
    {start:1,end:3,text:'Y',syntheticOriginId:'replace'}
  ],'unit:entry.js:1',PARSER);
  assert.equal(result.code,'aXYd');
  assert.equal(mapSourceSpan(result.map,span('unit:entry.js:1',source,1,3),source,result.code),null);
});

test('maps an empty source point consistently at a before-node insertion',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'before-node',syntheticOriginId:'prologue'}
  ],'unit:m.js:1',PARSER);
  const mapped=mapSourceSpan(result.map,span('unit:m.js:1',source,2,2),source,result.code);
  assert.deepEqual({start:mapped?.startOffset,end:mapped?.endOffset},{start:3,end:3});
});

test('rejects overlapping edits using the shared applyEdits contract',()=>{
  assert.throws(()=>applyEditsWithMap('abcdef',[
    {start:1,end:4,text:'x'},
    {start:3,end:5,text:'y'}
  ],'unit:m.js:1',PARSER),/Invalid or overlapping edit/);
});


test('canonical parser contracts distinguish script, module and CommonJS options',()=>{
  const script=parserContractIdFor('script');
  const module=parserContractIdFor('module');
  const commonjs=parserContractIdFor('commonjs');
  assert.notEqual(script,module);
  assert.notEqual(script,commonjs);
  assert.notEqual(module,commonjs);
  assert.match(module,/"version":"8\\.15\\.0"/);
  assert.match(commonjs,/"allowReturnOutsideFunction":true/);
});

test('lossless UTF-16 generation digests distinguish lone high and low surrogates',()=>{
  const high='const a="'+String.fromCharCode(0xD800)+'";';
  const low='const a="'+String.fromCharCode(0xDC00)+'";';
  assert.doesNotThrow(()=>require('../src/ast').parse(high,'module'));
  assert.doesNotThrow(()=>require('../src/ast').parse(low,'module'));
  assert.notEqual(Buffer.from(high,'utf16le').toString('hex'),
    Buffer.from(low,'utf16le').toString('hex'));
  assert.notEqual(sourceGenerationOf(high,PARSER),sourceGenerationOf(low,PARSER));

  const unit='unit:surrogate-response:1';
  const map=applyEditsWithMap(high,[
    {start:0,end:0,text:'// prefix'+String.fromCharCode(10),affinity:'before-node'}
  ],unit,PARSER);
  const lowSpan=span(unit,low,0,low.length);
  assert.equal(mapSourceSpan(map.map,lowSpan,low,map.code),null,
    'a map from a distinct parser-input generation must not be reusable');
});

test('maps zero-width spans at replacement and deletion boundaries, rejects interiors',()=>{
  const source='abcdef';
  const replacement=applyEditsWithMap(source,[
    {start:2,end:4,text:'XY'}
  ],'unit:boundaries:replacement',PARSER);
  const atStart=mapSourceSpan(replacement.map,
    span('unit:boundaries:replacement',source,2,2),source,replacement.code);
  const atEnd=mapSourceSpan(replacement.map,
    span('unit:boundaries:replacement',source,4,4),source,replacement.code);
  const inside=mapSourceSpan(replacement.map,
    span('unit:boundaries:replacement',source,3,3),source,replacement.code);
  assert.deepEqual([atStart?.startOffset,atStart?.endOffset],[2,2]);
  assert.deepEqual([atEnd?.startOffset,atEnd?.endOffset],[4,4]);
  assert.equal(inside,null);

  const deletion=applyEditsWithMap(source,[
    {start:2,end:4,text:''}
  ],'unit:boundaries:deletion',PARSER);
  const deleteStart=mapSourceSpan(deletion.map,
    span('unit:boundaries:deletion',source,2,2),source,deletion.code);
  const deleteEnd=mapSourceSpan(deletion.map,
    span('unit:boundaries:deletion',source,4,4),source,deletion.code);
  const deleteInside=mapSourceSpan(deletion.map,
    span('unit:boundaries:deletion',source,3,3),source,deletion.code);
  assert.deepEqual([deleteStart?.startOffset,deleteStart?.endOffset],[2,2]);
  assert.deepEqual([deleteEnd?.startOffset,deleteEnd?.endOffset],[2,2]);
  assert.equal(deleteInside,null);
});

test('runs deterministic span-preservation checks around UTF-16 edits',()=>{
  let seed=0x51f15e;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/2**32;
  };
  for(let sample=0;sample<500;sample++) {
    const source='😀'+Array.from({length:40},(_,i)=>
      String.fromCharCode(97+(i%26))).join('');
    /** @type {Array<{start:number,end:number,text:string,affinity?:'before-node'}>} */
    const edits=[];
    let cursor=0;
    for(let j=0;j<5;j++) {
      const start=cursor+Math.floor(random()*3);
      if(start>source.length)break;
      const width=Math.min(Math.floor(random()*3),source.length-start);
      const text=Array.from({length:Math.floor(random()*4)},()=>
        String.fromCharCode(65+Math.floor(random()*26))).join('');
      edits.push({start,end:start+width,text,
        ...(width===0?{affinity:'before-node'}:{})});
      cursor=start+width+1;
      if(cursor>=source.length)break;
    }
    const effective=edits.filter(edit=>edit.text!==source.slice(edit.start,edit.end));
    const result=applyEditsWithMap(source,edits,'unit:random.mjs:1',PARSER);
    for(let k=0;k<20;k++) {
      let start=Math.floor(random()*(source.length+1));
      let end=Math.floor(random()*(source.length+1));
      if(end<start)[start,end]=[end,start];
      const invalid=effective.some(edit=>edit.start===edit.end?
        start<edit.start&&edit.start<end:
        edit.start<end&&edit.end>start);
      const mapped=mapSourceSpan(result.map,span('unit:random.mjs:1',source,start,end),
        source,result.code);
      if(invalid)assert.equal(mapped,null);
      else {
        assert.ok(mapped);
        assert.equal(result.code.slice(mapped.startOffset,mapped.endOffset),source.slice(start,end));
      }
    }
  }
});
