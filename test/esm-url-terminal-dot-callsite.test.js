'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {string} path @param {string} code */
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
