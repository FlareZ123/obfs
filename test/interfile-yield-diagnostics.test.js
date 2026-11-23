'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const files=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretValue:3,otherKey:5};export function internal(){return state.secretValue;}'},
  {path:'workerA.mjs',sourceType:'module',
    code:'import {state} from "./state.mjs";function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}export const partial=worker(state);'},
  {path:'workerB.mjs',sourceType:'module',
    code:'import {state} from "./state.mjs";const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
  {path:'index.mjs',sourceType:'module',
    code:'import {state,internal} from "./state.mjs";import {partial as a} from "./workerA.mjs";import {partial as b} from "./workerB.mjs";export const value=(+a)+(+b)+internal()+state.secretValue+globalThis.window.api.bridge;'}
];

/**
 * @param {string} label
 * @param {import('../src/core').SourceFile[]} input
 * @param {{mode:'coo'|'sno'|'sco',strings:boolean,identifiers:boolean,closedWorld:boolean}} options
 */
function observe(label,input,options){
  const output=obfuscateFiles(input,{seed:'four-files',...options});
  const summary={
    label,mode:options.mode,strings:options.strings,
    identifiers:options.identifiers,closedWorld:options.closedWorld,
    files:output.files.length,
    crossObjects:output.crossFile.objects,crossProperties:output.crossFile.properties,
    localObjects:output.files.reduce((sum,file)=>sum+file.metrics.objects,0),
    localBindings:output.files.reduce((sum,file)=>sum+file.metrics.bindings,0)
  };
  process.stdout.write('INTERFILE_YIELD_DIAGNOSTIC '+JSON.stringify(summary)+'\n');
  assert.equal(summary.files,input.length);
  return summary;
}

test('source-pinned baseline interfile yield diagnostic controls',{
  timeout:30000
},()=>{
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const common={mode,strings:true,identifiers:true,closedWorld:true};
    observe('four-files-original',files,common);
    observe('four-files-no-ambient-host-root',
      files.map(file=>({path:file.path,sourceType:file.sourceType,
        code:file.path==='index.mjs'?
          file.code.replace('globalThis.window.api.bridge','10'):file.code})),common);
    observe('four-files-properties-only',files,{...common,strings:false,identifiers:false});
    observe('four-files-no-crossfile',files,{...common,closedWorld:false});
  }
});
