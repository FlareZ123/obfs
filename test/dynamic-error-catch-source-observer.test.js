'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

/**
 * The catch lexical binding receives a known newly created Error object;
 * accessing it through a runtime-assembled key reads its source coordinates.
 * @returns {string}
 */
function source(){
  return 'const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "const key=['st','ack'].join('');let frame;"+
    "try{throw new Error('source-location')}catch(caught){frame=caught[key].split('\\n')[1]}"+
    'export const observed={value,frame};';
}

/** @param {string} code @param {string} name @param {string} directory */
async function execute(code,name,directory){
  const file=path.join(directory,name+'.mjs');
  await atomicWrite(file,code);
  return /** @type {Promise<{observed:{value:number,frame:string}}>} */(
    import(pathToFileURL(file).href)
  );
}

/** @param {string} frame @returns {{line:number,column:number}} */
function coords(frame){
  const match=/:(\\d+):(\\d+)\\)?$/u.exec(frame);
  assert.ok(match,'Expected a native ESM stack frame: '+frame);
  return {line:Number(match[1]),column:Number(match[2])};
}

test('caught Error through dynamically assembled key preserves source column',async()=>{
  const native=source();
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'caught-error-computed-stack',
    properties:true,identifiers:false,strings:false
  }).files[0];
  const root=await mkdtemp(path.join(tmpdir(),'obfs-error-catch-'));
  try{
    const original=(await execute(native,'native',root)).observed;
    const compiled=(await execute(/** @type {string} */(output.code),'compiled',root)).observed;
    assert.equal(original.value,47);
    assert.equal(compiled.value,47);
    assert.deepEqual(coords(compiled.frame),coords(original.frame),
      'A captured Error can cross a catch binding before .stack inspection');
    assert.equal(output.metrics.properties,0);
    assert.equal(observesFunctionSource(parse(native,'module')),true);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('plain primitive catch still allows unrelated owner private rename',()=>{
  const native='const owner={longPrivateFieldForSource:47};'+
    'const value=owner.longPrivateFieldForSource;'+
    "let final=0;try{throw 1}catch(caught){final=caught;}"+
    'export const observed=value+final;';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:native}],{
    mode:'coo',closedWorld:true,seed:'primitive-catch-private-positive',
    properties:true,identifiers:false,strings:false
  }).files[0];
  assert.equal(output.metrics.properties,1);
});
