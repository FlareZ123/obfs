'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core.js');

test('private parameter-owner remains transformable without DOM string coercion',()=>{
  const result=obfuscateFiles([{
    path:'parameter-owner.mjs',sourceType:'module',
    code:'function compute(payload){const owner={secretField:payload,bias:3};'+
      'return owner.secretField+owner.bias;}'+
      'if(compute(39)!==42)throw new Error("parameter property result mismatch");'+
      'document.getElementById("answer").textContent="42";'
  }],{mode:'coo',seed:'chrome-local-formal-owner',
    identifiers:false,strings:false,properties:true});
  assert.equal(result.files[0].metrics.objects,1);
});

test('cross-file shorthand parameter owner remains transformable behind a public wrapper',()=>{
  const result=obfuscateFiles([
    {path:'parameter-shorthand-helper.mjs',sourceType:'module',
      code:'function compute(payload){const owner={payload,bias:3};'+
        'return owner.payload+owner.bias;}'+
        'export function publicCompute(input){return compute(input);}'},
    {path:'parameter-shorthand-entry.mjs',sourceType:'module',
      code:'import {publicCompute} from "./parameter-shorthand-helper.mjs";'+
        'if(publicCompute(39)!==42)throw new Error("parameter shorthand result mismatch");'+
        'document.getElementById("answer").textContent="42";'}
  ],{mode:'coo',closedWorld:false,seed:'chrome-local-formal-shorthand',
    identifiers:false,strings:false,properties:true});
  assert.equal(result.files.reduce((sum,file)=>sum+file.metrics.objects,0),1);
});

test('benchmark private-helper workloads retain property yield and stay within budget',()=>{
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(process.execPath,['test/benchmark.js'],{
    encoding:'utf8',timeout:30000
  });
  assert.equal(result.status,0,result.stderr||result.stdout||'benchmark failed');
});
