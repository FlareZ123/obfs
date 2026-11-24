'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyEditsWithMap,mapSourceSpan,sourceGenerationOf}=require('../src/source-edit-map');

/** @param {string} sourceUnitRef @param {string} source @param {number} start @param {number} end */
function span(sourceUnitRef,source,start,end) {
  return {sourceUnitRef,sourceGeneration:sourceGenerationOf(source),start,end};
}

test('maps a protected span through edits before and after it',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:1,end:2,text:'XYZ',syntheticOriginId:'renamed-key'},
    {start:5,end:6,text:''}
  ],'module.cjs');
  const original=span('module.cjs',source,2,5);
  const mapped=mapSourceSpan(result.map,original,source,result.code);
  assert.deepEqual(mapped,{
    sourceUnitRef:'module.cjs',
    sourceGeneration:sourceGenerationOf(result.code),
    start:4,end:7
  });
  assert.equal(result.code.slice(mapped.start,mapped.end),source.slice(original.start,original.end));
});

test('rejects protected spans intersected by replacement or interior insertion',()=>{
  const source='abcdef';
  const replacement=applyEditsWithMap(source,[
    {start:3,end:4,text:'Q',syntheticOriginId:'property-key'}
  ],'m.js');
  assert.equal(mapSourceSpan(replacement.map,span('m.js',source,2,5),source,replacement.code),null);
  const insertion=applyEditsWithMap(source,[
    {start:3,end:3,text:'Q',affinity:'before-node',syntheticOriginId:'helper'}
  ],'m.js');
  assert.equal(mapSourceSpan(insertion.map,span('m.js',source,2,5),source,insertion.code),null);
});

test('requires explicit before-node affinity for insertion at a protected span start',()=>{
  const source='abcdef';
  const before=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'before-node',syntheticOriginId:'prologue'}
  ],'m.js');
  const mapped=mapSourceSpan(before.map,span('m.js',source,2,4),source,before.code);
  assert.deepEqual({start:mapped?.start,end:mapped?.end},{start:3,end:5});
  const unknown=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',syntheticOriginId:'unclassified'}
  ],'m.js');
  assert.equal(mapSourceSpan(unknown.map,span('m.js',source,2,4),source,unknown.code),null);
  const inside=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'within-node'}
  ],'m.js');
  assert.equal(mapSourceSpan(inside.map,span('m.js',source,2,4),source,inside.code),null);
});

test('insertion at the half-open span end remains outside the protected source',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:4,end:4,text:'X',syntheticOriginId:'following-prologue'}
  ],'m.js');
  const mapped=mapSourceSpan(result.map,span('m.js',source,2,4),source,result.code);
  assert.deepEqual({start:mapped?.start,end:mapped?.end},{start:2,end:4});
});

test('maps synthetic prologue insertion at an exact callable boundary',()=>{
  const source='function f(){return "private";}';
  const start=source.indexOf('function');
  const result=applyEditsWithMap(source,[
    {start,end:start,text:'const _helper=0;\n',
      affinity:'before-node',syntheticOriginId:'string-decoder-prologue'}
  ],'entry.mjs');
  const mapped=mapSourceSpan(result.map,span('entry.mjs',source,start,source.length),
    source,result.code);
  assert.ok(mapped);
  assert.equal(result.code.slice(mapped.start,mapped.end),source.slice(start));
});

test('uses UTF-16 code-unit offsets after astral Unicode',()=>{
  const source='😀abc';
  assert.equal(source.length,5);
  const result=applyEditsWithMap(source,[
    {start:2,end:2,text:'X',affinity:'before-node',syntheticOriginId:'helper'}
  ],'unicode.mjs');
  const mapped=mapSourceSpan(result.map,span('unicode.mjs',source,2,5),source,result.code);
  assert.deepEqual({start:mapped?.start,end:mapped?.end},{start:3,end:6});
  assert.equal(result.code.slice(mapped.start,mapped.end),'abc');
});

test('maps a span through a sequential chain of source generations',()=>{
  const source='0123456789';
  const first=applyEditsWithMap(source,[
    {start:1,end:2,text:'ABC',syntheticOriginId:'private-key'}
  ],'entry.cjs');
  const original=span('entry.cjs',source,4,7);
  const firstSpan=mapSourceSpan(first.map,original,source,first.code);
  assert.deepEqual({start:firstSpan?.start,end:firstSpan?.end},{start:6,end:9});
  const second=applyEditsWithMap(first.code,[
    {start:0,end:0,text:'!',affinity:'before-node',syntheticOriginId:'banner'},
    {start:10,end:11,text:'Z',syntheticOriginId:'suffix'}
  ],'entry.cjs');
  const secondSpan=mapSourceSpan(second.map,firstSpan,first.code,second.code);
  assert.deepEqual({start:secondSpan?.start,end:secondSpan?.end},{start:7,end:10});
  assert.equal(second.code.slice(secondSpan.start,secondSpan.end),source.slice(4,7));
});

test('refuses stale source-unit and generation identities',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:0,end:0,text:'!',affinity:'before-node'}
  ],'a.mjs');
  assert.equal(mapSourceSpan(result.map,span('b.mjs',source,2,4),source,result.code),null);
  const stale={...span('a.mjs','changed',2,4)};
  assert.equal(mapSourceSpan(result.map,stale,source,result.code),null);
  assert.equal(mapSourceSpan(result.map,span('a.mjs',source,2,4),source,'tampered'),null);
});

test('preserves applyEdits ordering for multiple insertions at one offset',()=>{
  const source='ab';
  const result=applyEditsWithMap(source,[
    {start:1,end:1,text:'X',affinity:'before-node',syntheticOriginId:'first'},
    {start:1,end:1,text:'Y',affinity:'before-node',syntheticOriginId:'second'}
  ],'entry.js');
  assert.equal(result.code,'aYXb');
  const mapped=mapSourceSpan(result.map,span('entry.js',source,1,2),source,result.code);
  assert.deepEqual({start:mapped?.start,end:mapped?.end},{start:3,end:4});
  assert.equal(result.code.slice(mapped.start,mapped.end),'b');
  assert.deepEqual(result.map.segments.filter(x=>x.kind==='inserted')
    .map(x=>x.syntheticOriginId),['second','first']);
});

test('supports insertion at the start of a replacement while preserving exact edit order',()=>{
  const source='abcd';
  const result=applyEditsWithMap(source,[
    {start:1,end:1,text:'X',affinity:'before-node'},
    {start:1,end:3,text:'Y',syntheticOriginId:'replace'}
  ],'entry.js');
  assert.equal(result.code,'aXYd');
  assert.equal(mapSourceSpan(result.map,span('entry.js',source,1,3),source,result.code),null);
});

test('rejects overlapping edits using the shared applyEdits contract',()=>{
  assert.throws(()=>applyEditsWithMap('abcdef',[
    {start:1,end:4,text:'x'},
    {start:3,end:5,text:'y'}
  ],'m.js'),/Invalid or overlapping edit/);
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
        ...(start===start+width?{affinity:'before-node'}:{})});
      cursor=start+width+1;
      if(cursor>=source.length)break;
    }
    const effective=edits.filter(edit=>edit.text!==source.slice(edit.start,edit.end));
    const result=applyEditsWithMap(source,edits,'random.mjs');
    for(let k=0;k<20;k++) {
      let start=Math.floor(random()*(source.length+1));
      let end=Math.floor(random()*(source.length+1));
      if(end<start)[start,end]=[end,start];
      const invalid=effective.some(edit=>edit.start===edit.end?
        start<edit.start&&edit.start<end:
        edit.start<end&&edit.end>start);
      const mapped=mapSourceSpan(result.map,span('random.mjs',source,start,end),
        source,result.code);
      if(invalid)assert.equal(mapped,null);
      else {
        assert.ok(mapped);
        assert.equal(result.code.slice(mapped.start,mapped.end),source.slice(start,end));
      }
    }
  }
});
