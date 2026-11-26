'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {string} path @param {string} code @returns {ModuleFile} */
function moduleFile(path,code) {
  return {path,sourceType:'module',code};
}

test('terminal dot URL identity refuses cross-file owner proof',()=>{
  const files=[
    moduleFile('state.mjs','export const state={secretField:23};'),
    moduleFile('entry.mjs','import {state} from "./state.mjs/.";console.log(state.secretField);')
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'pr379-terminal-dot-cross-review',
    closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,0);
});

test('terminal dot URL identity prevents an incomplete ESM host-lock graph',()=>{
  const files=[
    moduleFile('state.mjs','export const state={secretField:23};'),
    moduleFile('entry.mjs','import {state} from "./state.mjs/.";console.log(state.secretField);')
  ];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'pr379-terminal-dot-host-review',
    closedWorld:true,allowedHosts:['allowed.example'],
    strings:false,identifiers:false
  }),/Host locking ESM static imports or reexports requires a complete closed-world module group/u);
});

test('terminal dot URL identity disables unproved static ESM string decoding',()=>{
  const files=[
    moduleFile('state.mjs','export const state={label:"private-literal"};'),
    moduleFile('entry.mjs','import {state} from "./state.mjs/.";export const value=state.label;')
  ];
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'pr379-terminal-dot-decoder-review',
    closedWorld:true,strings:true,properties:false,identifiers:false
  });
  assert.equal(output.files.reduce((sum,file)=>sum+file.metrics.literals,0),0);
});

test('query, fragment, encoded-dot, encoded-separator and trailing-slash paths do not enter cross-file proof',()=>{
  const owner='export const state={secretField:23};export function peek(x){return x.secretField;}';
  /** @param {string} specifier @param {ModuleFile[]} [decoys] @returns {ModuleFile[]} */
  function ownerGraph(specifier,decoys=[]) {
    return [
      moduleFile('state.mjs',owner),
      ...decoys,
      moduleFile('entry.mjs',
        'import {state,peek} from '+JSON.stringify(specifier)+';console.log(peek(state));')
    ];
  }
  const options={mode:'coo',seed:'pr379-url-boundary-review',
    closedWorld:true,strings:false,identifiers:false};
  assert.equal(obfuscateFiles(ownerGraph('./state.mjs'),options).crossFile.properties,1,
    'canonical control must admit the established proof');
  /** @type {Array<{specifier:string,decoys?:ModuleFile[],throws?:RegExp}>} */
  const cases=[
    {specifier:'./state.mjs?version=1'},
    {specifier:'./state.mjs#fragment',decoys:[moduleFile('state.mjs#fragment',owner)]},
    {specifier:'./state.mjs/%2e',decoys:[moduleFile('state.mjs/%2e',owner)]},
    {specifier:'./state.mjs%2fchild',decoys:[moduleFile('state.mjs/child',owner)]},
    {specifier:'./folder/../state.mjs/',throws:/File conflicts with directory: state\\.mjs/u}
  ];
  for(const candidate of cases) {
    const run=()=>obfuscateFiles(ownerGraph(candidate.specifier,candidate.decoys),options);
    if(candidate.throws) {
      assert.throws(run,candidate.throws,candidate.specifier);
    } else {
      assert.equal(run().crossFile.properties,0,candidate.specifier);
    }
  }
});
