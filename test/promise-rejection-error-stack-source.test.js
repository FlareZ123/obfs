'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

/** @param {string} source @param {string} directory @param {string} id */
async function load(source,directory,id) {
  const file=path.join(directory,id+'.mjs');
  await atomicWrite(file,source);
  return /** @type {Promise<{observed:{value:number,frame:string}}>} */(
    import(pathToFileURL(file).href)
  );
}

/** @param {string} frame @returns {{line:number,column:number}} */
function frameLocation(frame){
  const match=/:(\d+):(\d+)\)?$/u.exec(frame);
  assert.ok(match,'Missing native ESM stack coordinate: '+frame);
  return {line:Number(match[1]),column:Number(match[2])};
}

test('Promise rejection callback may read source coordinates without seeing function',async()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "const key=['st','ack'].join('');"+
    "export const observed=await Promise.reject(new Error('origin')).catch("+
    "caught=>({value,frame:caught[key].split('\\n')[1]}));";
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',seed:'rejected-error-stack',closedWorld:true,
    properties:true,identifiers:false,strings:false
  }).files[0];
  const directory=await mkdtemp(path.join(tmpdir(),'obfs-rejection-source-'));
  try{
    const original=(await load(native,directory,'native')).observed;
    const compiled=(await load(/** @type {string} */(result.code),
      directory,'compiled')).observed;
    assert.equal(original.value,47);
    assert.equal(compiled.value,47);
    assert.deepEqual(frameLocation(compiled.frame),frameLocation(original.frame),
      'A rejected Error may cross an async callback boundary to an opaque stack reader');
    assert.equal(result.metrics.properties,0);
    assert.equal(observesFunctionSource(parse(native,'module')),true);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});

test('Promise.resolve primitive without source inspection retains private rename',()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'export const observed=await Promise.resolve(owner.longPrivateFieldForSource);';
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',seed:'resolved-primitive-private-positive',closedWorld:true,
    properties:true,identifiers:false,strings:false
  }).files[0];
  assert.equal(result.metrics.properties,1);
});
