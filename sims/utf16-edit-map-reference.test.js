'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyEditsWithMap}=require('./utf16-edit-map-reference');

test('maps spans through edits before and after the span',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:1,end:2,text:'XYZ'},
    {start:5,end:6,text:''}
  ]);
  const original={start:2,end:5};
  const mapped=result.mapSpan(original);
  assert.deepEqual(mapped,{start:4,end:7});
  assert.equal(result.output.slice(mapped.start,mapped.end),source.slice(original.start,original.end));
});

test('rejects spans intersected by replacement or interior insertion',()=>{
  const replacement=applyEditsWithMap('abcdef',[{start:3,end:4,text:'Q'}]);
  assert.equal(replacement.mapSpan({start:2,end:5}),null);
  const insertion=applyEditsWithMap('abcdef',[{start:3,end:3,text:'Q'}]);
  assert.equal(insertion.mapSpan({start:2,end:5}),null);
});

test('insertion at span start is before it and insertion at span end is after it',()=>{
  const source='abcdef';
  const atStart=applyEditsWithMap(source,[{start:2,end:2,text:'X'}]);
  const startSpan=atStart.mapSpan({start:2,end:4});
  assert.deepEqual(startSpan,{start:3,end:5});
  assert.equal(atStart.output.slice(startSpan.start,startSpan.end),'cd');
  const atEnd=applyEditsWithMap(source,[{start:4,end:4,text:'X'}]);
  const endSpan=atEnd.mapSpan({start:2,end:4});
  assert.deepEqual(endSpan,{start:2,end:4});
  assert.equal(atEnd.output.slice(endSpan.start,endSpan.end),'cd');
});

test('maps insertion boundaries with explicit left and right bias',()=>{
  const result=applyEditsWithMap('abcd',[{start:2,end:2,text:'XY'}]);
  assert.equal(result.mapOffset(2,'left'),2);
  assert.equal(result.mapOffset(2,'right'),4);
  assert.equal(result.mapOffset(3),5);
});

test('uses UTF-16 code-unit offsets around astral characters',()=>{
  const source='😀abc';
  assert.equal(source.length,5);
  const result=applyEditsWithMap(source,[{start:2,end:2,text:'X'}]);
  const mapped=result.mapSpan({start:2,end:5});
  assert.deepEqual(mapped,{start:3,end:6});
  assert.equal(result.output.slice(mapped.start,mapped.end),'abc');
});

test('composes span maps across sequential transformation passes',()=>{
  const source='0123456789';
  const first=applyEditsWithMap(source,[{start:1,end:2,text:'ABC'}]);
  const firstSpan=first.mapSpan({start:4,end:7});
  assert.deepEqual(firstSpan,{start:6,end:9});
  const second=applyEditsWithMap(first.output,[{start:0,end:0,text:'!'}, {start:10,end:11,text:'Z'}]);
  const secondSpan=second.mapSpan(firstSpan);
  assert.deepEqual(secondSpan,{start:7,end:10});
  assert.equal(second.output.slice(secondSpan.start,secondSpan.end),source.slice(4,7));
});

test('preserves spans when edits only touch their boundaries',()=>{
  const result=applyEditsWithMap('abcdef',[
    {start:0,end:2,text:'X'},
    {start:4,end:6,text:'Y'}
  ]);
  assert.equal(result.preservesSpan({start:2,end:4}),true);
  assert.deepEqual(result.mapSpan({start:2,end:4}),{start:1,end:3});
});

test('ignores no-op edits without invalidating protected spans',()=>{
  const source='abcdef';
  const result=applyEditsWithMap(source,[
    {start:2,end:4,text:'cd'},
    {start:3,end:3,text:''}
  ]);
  assert.equal(result.output,source);
  assert.equal(result.edits.length,0);
  assert.deepEqual(result.mapSpan({start:1,end:5}),{start:1,end:5});
});

test('rejects overlapping edits and ambiguous same-offset edits',()=>{
  assert.throws(()=>applyEditsWithMap('abcdef',[
    {start:1,end:4,text:'x'},
    {start:3,end:5,text:'y'}
  ]),/Overlapping edits/);
  assert.throws(()=>applyEditsWithMap('abcdef',[
    {start:2,end:2,text:'x'},
    {start:2,end:3,text:'y'}
  ]),/Multiple edits/);
});

test('preserves 40,000 deterministic random spans across non-overlapping edits',()=>{
  let seed=0x51f15e;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/2**32;
  };
  for(let sample=0;sample<2000;sample++){
    const source='😀'+Array.from({length:40},(_,i)=>String.fromCharCode(97+(i%26))).join('');
    /** @type {Array<{start:number,end:number,text:string}>} */
    const edits=[];
    let cursor=0;
    for(let j=0;j<6;j++){
      const start=cursor+Math.floor(random()*3);
      if(start>source.length)break;
      const width=Math.min(Math.floor(random()*3),source.length-start);
      const text=Array.from({length:Math.floor(random()*4)},()=>
        String.fromCharCode(65+Math.floor(random()*26))).join('');
      edits.push({start,end:start+width,text});
      cursor=start+width+1;
      if(cursor>=source.length)break;
    }
    const effectiveEdits=edits.filter(edit=>edit.text!==source.slice(edit.start,edit.end));
    const result=applyEditsWithMap(source,edits);
    for(let k=0;k<20;k++){
      let start=Math.floor(random()*(source.length+1));
      let end=Math.floor(random()*(source.length+1));
      if(end<start)[start,end]=[end,start];
      const overlaps=effectiveEdits.some(edit=>edit.start===edit.end?
        start<edit.start&&edit.start<end:
        edit.start<end&&edit.end>start);
      const mapped=result.mapSpan({start,end});
      if(overlaps)assert.equal(mapped,null);
      else {
        assert.ok(mapped);
        assert.equal(result.output.slice(mapped.start,mapped.end),source.slice(start,end));
      }
    }
  }
});
