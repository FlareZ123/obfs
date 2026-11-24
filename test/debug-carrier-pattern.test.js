'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

test('debug private carrier destructuring proof',()=>{
  process.env.OBFS_DEBUG_CARRIER='1';
  try{
    const result=obfuscateFiles([
      {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};export function peek(x){return x.secretField;}'},
      {path:'main.mjs',sourceType:'module',code:'import {state,peek} from "./state.mjs";const carrier={first:state,second:state};const {first:left,second:right}=carrier;const local=value=>value.secretField;console.log(peek(left),local(right));'}
    ],{mode:'coo',seed:'debug-carrier',closedWorld:true,strings:false,identifiers:false});
    console.error('debug-result',result.crossFile);
    assert.equal(result.crossFile.properties,1);
  }finally{
    delete process.env.OBFS_DEBUG_CARRIER;
  }
});
