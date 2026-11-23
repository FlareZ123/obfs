'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,mkdir,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} origin
 * @param {{path:string,code:string}[]} files
 * @returns {Promise<{payload:number,frame:string}>}
 */
async function execute(origin,files){
  await mkdir(origin,{recursive:true});
  for(const file of files)await atomicWrite(path.join(origin,file.path),file.code);
  const url=pathToFileURL(path.join(origin,'reader.mjs')).href;
  const module=await /** @type {Promise<{observed:{payload:number,frame:string}}>} */(
    import(url)
  );
  return module.observed;
}

/** @param {string} frame @returns {{line:number,column:number}} */
function location(frame){
  const match=/:(\d+):(\d+)\)?$/u.exec(frame);
  assert.ok(match,'Expected actual native Node ESM stack frame: '+frame);
  return {line:Number(match[1]),column:Number(match[2])};
}

test('cross-file computed Error.stack consumer preserves producer source coordinates',async()=>{
  const producer='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "export const error=new Error('source-location');export const payload=value;";
  const reader="import {error,payload} from './producer.mjs';"+
    "const key=['st','ack'].join('');"+
    "export const observed={payload,frame:error[key].split('\\n')[1]};";
  const inputs=[
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'reader.mjs',sourceType:'module',code:reader}
  ];
  const compiled=obfuscateFiles(inputs,{
    mode:'coo',closedWorld:true,seed:'agent39-cross-file-error-alias',
    properties:true,identifiers:false,strings:false
  });
  const root=await mkdtemp(path.join(tmpdir(),'obfs-cross-error-stack-'));
  try{
    const native=await execute(path.join(root,'native'),inputs);
    const protectedResult=await execute(path.join(root,'compiled'),compiled.files);
    assert.equal(native.payload,47);
    assert.equal(protectedResult.payload,47);
    assert.deepEqual(location(protectedResult.frame),location(native.frame),
      'A consumer may inspect the producer Error source column via an imported Error object');
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('same graph with exported primitive and no Error retains property transformation',()=>{
  const producer='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;export const payload=value;';
  const reader="import {payload} from './producer.mjs';export const observed=payload;";
  const result=obfuscateFiles([
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'reader.mjs',sourceType:'module',code:reader}
  ],{
    mode:'coo',closedWorld:true,seed:'agent39-cross-file-primitive-positive',
    properties:true,identifiers:false,strings:false
  });
  const edited=result.files.find(file=>file.path==='producer.mjs');
  assert.ok(edited);
  assert.equal(edited.metrics.properties,1);
});
