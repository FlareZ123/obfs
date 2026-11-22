'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @typedef {'script'|'module'} SourceType */
/** @typedef {{caseName:string,sourceType:SourceType,code:string}} Probe */

const fixtures=/** @type {Probe[]} */ ([
  {caseName:'dynamic only script',sourceType:'script',
    code:'import("./target.mjs");'},
  {caseName:'dynamic only module',sourceType:'module',
    code:'import("./target.mjs");'},
  {caseName:'importScripts and dynamic',sourceType:'script',
    code:'importScripts("./side.js");import("./target.mjs");'},
  {caseName:'importScripts without dynamic',sourceType:'script',
    code:'importScripts("./side.js");'},
  {caseName:'script postMessage constant',sourceType:'script',
    code:'postMessage("ok");import("./target.mjs");'},
  {caseName:'script dynamic callback value',sourceType:'script',
    code:'import("./target.mjs").then(({default:v})=>postMessage(v));'},
  {caseName:'script dynamic callback void value',sourceType:'script',
    code:'import("./target.mjs").then(({default:v})=>void v);'},
  {caseName:'module dynamic callback value',sourceType:'module',
    code:'import("./target.mjs").then(({default:v})=>postMessage(v));'}
]);

test('observe script+module source inspector decoder yield matrix',()=>{
  /** @type {Array<{caseName:string,sourceType:SourceType,literals:number}>} */
  const records=[];
  for(const fixture of fixtures){
    const compiled=obfuscateFiles([
      {path:'worker.js',sourceType:fixture.sourceType,code:fixture.code},
      {path:'target.mjs',sourceType:'module',
        code:"export default 'protected-literal-value';"}
    ],{
      mode:'coo',strings:true,identifiers:false,properties:false,
      seed:'source-observer-worker-probe/'+fixture.caseName
    });
    const count=compiled.files.find(file=>file.path==='target.mjs')?.metrics.literals??-1;
    assert.ok(count>=0,'Missing target metric');
    records.push({caseName:fixture.caseName,sourceType:fixture.sourceType,literals:count});
  }
  console.log('WORKER_LOADER_STRING_YIELD_MATRIX '+JSON.stringify(records));
});
