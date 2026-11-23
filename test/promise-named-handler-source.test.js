'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} source @param {string} file */
async function evaluate(source,file) {
  await atomicWrite(file,source);
  return /** @type {Promise<{observed:{value:number,frame:string}}>} */(
    import(pathToFileURL(file).href)
  );
}

/** @param {string} row */
function location(row){
  const match=/:(\d+):(\d+)\)?$/u.exec(row);
  assert.ok(match,'Expected Node ESM source coordinate: '+row);
  return {line:Number(match[1]),column:Number(match[2])};
}

test('named Promise rejection handler tracks Error.stack source across callback',async()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "const key=['st','ack'].join('');"+
    "function handler(caught){return {value,frame:caught[key].split('\\n')[1]}}"+
    "export const observed=await Promise.reject(new Error('origin')).catch(handler);";
  const compiled=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'named-rejection-error-stack',
    properties:true,identifiers:false,strings:false
  }).files[0];
  const root=await mkdtemp(path.join(tmpdir(),'obfs-named-rejection-'));
  try{
    const original=(await evaluate(native,path.join(root,'native.mjs'))).observed;
    const emitted=(await evaluate(/** @type {string} */(compiled.code),
      path.join(root,'emitted.mjs'))).observed;
    assert.equal(emitted.value,47);
    assert.deepEqual(location(emitted.frame),location(original.frame),
      'A named Promise rejection callback can inspect a rejected Error source column');
    assert.equal(compiled.metrics.properties,0);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('named Promise.then rejection handler is an Error-stack carrier',()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "const key=['st','ack'].join('');"+
    "function handler(caught){return {value,frame:caught[key].split('\\n')[1]}}"+
    "export const observed=await Promise.reject(new Error('origin')).then(null,handler);";
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'named-then-rejection-error-stack',
    properties:true,identifiers:false,strings:false
  }).files[0];
  assert.equal(output.metrics.properties,0);
});

test('inline Promise.then rejection handler also protects Error.stack',()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "const key=['st','ack'].join('');"+
    "export const observed=await Promise.reject(new Error('origin')).then(null,"+
    "caught=>({value,frame:caught[key].split('\\n')[1]}));";
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'inline-then-rejection-error-stack',
    properties:true,identifiers:false,strings:false
  }).files[0];
  assert.equal(output.metrics.properties,0);
});
