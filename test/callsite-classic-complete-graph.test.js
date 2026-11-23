'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {{value:number,source:string}} Observation */

/**
 * @param {Array<{path:string,sourceType:'script',code:string}>} files
 * @returns {Observation}
 */
function execute(files){
  const context=vm.createContext({});
  for(const file of files)
    vm.runInContext(file.code,context,{timeout:3000,filename:file.path});
  return /** @type {Observation} */(context.observedResult);
}

test('complete classic-script host and application graph preserves CallSite caller source',()=>{
  /** @type {Array<{path:string,sourceType:'script',code:string}>} */
  const files=[
    {path:'host.js',sourceType:'script',code:
      'globalThis.observedSource="";'+
      'function hostCallback(){'+
      'const previous=Error.prepareStackTrace;'+
      'try{Error.prepareStackTrace=(_error,frames)=>{'+
        'const caller=frames.find(frame=>frame.getFunctionName()==="readPrivate");'+
        'globalThis.observedSource=caller?String(caller.getFunction()):"";return "";'+
      '};void new Error("host-probe").stack;}'+
      'finally{if(previous===undefined)delete Error.prepareStackTrace;'+
        'else Error.prepareStackTrace=previous;}}'},
    {path:'app.js',sourceType:'script',code:
      'const owner={privateSecret:31};'+
      'const independent={otherSecret:73};'+
      'function readPrivate(){hostCallback();return owner.privateSecret;}'+
      'globalThis.probeValue=readPrivate()+independent.otherSecret;'},
    {path:'report.js',sourceType:'script',code:
      'globalThis.observedResult={'+
      'value:globalThis.probeValue,source:globalThis.observedSource};'}
  ];
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'classic-callsite-fully-enumerated',
    properties:true,identifiers:false,strings:false
  });
  const original=execute(files);
  const actual=execute(compiled.files.map(file=>({
    path:file.path,sourceType:/** @type {const} */('script'),
    code:/** @type {string} */(file.code)
  })));
  const propertyCount=compiled.files.reduce((n,file)=>n+file.metrics.properties,0);
  process.stdout.write('CALLSITE_CLASSIC_COMPLETE_GRAPH '+JSON.stringify({
    original,actual,properties:propertyCount
  })+'\n');
  assert.equal(original.value,104);
  assert.equal(actual.value,original.value);
  assert.match(original.source,/owner\.privateSecret/);
  assert.equal(actual.source,original.source,
    'A fully supplied classic script graph must preserve host-observed caller source');
});
