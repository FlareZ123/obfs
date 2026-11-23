'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** Browser private-tuple/record fixture with an exported source-stable wrapper. */
test('browser private container fields still rename in direct-call-only helper',()=>{
  const sources=[
    {path:'container-state.mjs',sourceType:/** @type {const} */('module'),
      code:'const vault={hiddenCount:17,secretDelta:3};'+
        'const tuple=[false,vault];const fromTuple=tuple[1];'+
        'const record={tag:"private",privateOwner:vault};'+
        'const fromRecord=record.privateOwner;'+
        'function privateCalculate(n){return fromTuple.hiddenCount*n+fromRecord.secretDelta;}'+
        'export function calculate(n){return privateCalculate(n);}'},
    {path:'container-entry.mjs',sourceType:/** @type {const} */('module'),
      code:'import {calculate} from "./container-state.mjs";'+
        'window.hostApi.accept(calculate(2));'}
  ];
  const result=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'chrome-private-containers',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(result.files.reduce((total,file)=>total+file.metrics.properties,0),2);
  const producer=result.files.find(file=>file.path==='container-state.mjs');
  assert.ok(producer);
  assert.match(String(producer.code),/export function calculate\(n\)\{return privateCalculate\(n\);\}/u);
  assert.doesNotMatch(String(producer.code),/fromTuple\.hiddenCount|fromRecord\.secretDelta/u);
});
