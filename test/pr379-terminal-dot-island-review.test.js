'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {string} path @param {string} code */
function moduleFile(path,code) {
  return {path,sourceType:'module',code};
}

test('terminal dot URL identity blocks an otherwise isolated source-observer island',()=>{
  const files=[
    moduleFile('watched.mjs','export function watched(){return 1;}'),
    moduleFile('independent.mjs','const record={privateField:23};export function independent(){return record.privateField;}'),
    moduleFile('entry.mjs',
      'import {watched} from "./watched.mjs";'+
      'import {independent} from "./independent.mjs/.";'+
      'console.log(watched.toString(),independent());')
  ];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'pr379-terminal-dot-island-review',
    closedWorld:true,strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer island/u);
});
