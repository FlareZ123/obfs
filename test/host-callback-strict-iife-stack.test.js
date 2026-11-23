'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,mkdir,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Exercise the exact one-file closed-world ESM candidate without identifier
 * mangling or string lowering so any source-column edit is attributable to
 * a property rewrite.
 * @param {string} code
 * @param {string} seed
 */
function compiled(code,seed) {
  return obfuscateFiles([{path:'entry.mjs',sourceType:'module',code}],{
    mode:'coo',closedWorld:true,seed,
    properties:true,identifiers:false,strings:false
  }).files[0];
}

/**
 * Load an independent ESM file written through the repository's atomic API.
 * @param {string} directory
 * @param {string} name
 * @param {string} source
 * @returns {Promise<{observed:unknown}>}
 */
async function load(directory,name,source) {
  const root=path.join(directory,name);
  await mkdir(root,{recursive:true});
  const file=path.join(root,'entry.mjs');
  await atomicWrite(file,source);
  return /** @type {Promise<{observed:unknown}>} */(import(pathToFileURL(file).href));
}

test('strict ESM direct arrow IIFE keeps non-escaping owner property rewrite yield',async()=>{
  const source='const owner={longPrivateFieldForHost:47};'+
    'const result=(()=>owner.longPrivateFieldForHost)();export const observed=result;';
  const candidate=compiled(source,'strict-private-primitive-iife');
  assert.equal(candidate.metrics.properties,1,
    'A private strict IIFE must provide a useful positive rewrite opportunity');
  const root=await mkdtemp(path.join(tmpdir(),'obfs-arrow-local-'));
  try {
    const original=await load(root,'native',source);
    const protectedEntry=await load(root,'compiled',
      /** @type {string} */(candidate.code));
    assert.equal(original.observed,47);
    assert.deepEqual(protectedEntry.observed,original.observed);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('host callback can record strict IIFE source callsite without touching its function value',async()=>{
  const source='const owner={longPrivateFieldForHost:47};'+
    'const result=(()=>globalThis.HOST_STACK_SPY(owner.longPrivateFieldForHost))();'+
    'export const observed=result;';
  const candidate=compiled(source,'strict-host-stack-iife');
  const root=await mkdtemp(path.join(tmpdir(),'obfs-arrow-host-'));
  const previous=globalThis.HOST_STACK_SPY;
  try {
    globalThis.HOST_STACK_SPY=/** @type {(value:number)=>{value:number,line:number,column:number}} */(
      value=>{
        const row=new Error('host source observer').stack?.split('\n')[2]??'';
        const match=/:(\d+):(\d+)\)?$/u.exec(row);
        assert.ok(match,'Expected an ESM caller frame from native Error.stack: '+row);
        return {value,line:Number(match[1]),column:Number(match[2])};
      }
    );
    const original=await load(root,'native',source);
    const protectedEntry=await load(root,'compiled',
      /** @type {string} */(candidate.code));
    assert.equal(/** @type {{value:number,line:number,column:number}} */(
      original.observed).value,47);
    assert.equal(/** @type {{value:number,line:number,column:number}} */(
      original.observed).line,1);
    assert.ok(/** @type {{value:number,line:number,column:number}} */(
      original.observed).column>0,
    'The external host must record a native ESM source column');
    assert.deepEqual(protectedEntry.observed,original.observed,
      'Unknown external host callbacks can observe compiler-changed callsites');
    if(candidate.metrics.properties===0)
      assert.equal(candidate.code,source,
        'A sound conservative host-provenance refusal may emit unchanged text');
  }finally{
    if(previous===undefined)delete globalThis.HOST_STACK_SPY;
    else globalThis.HOST_STACK_SPY=previous;
    await rm(root,{recursive:true,force:true});
  }
});

test('manual equal-width private-key rewrite retains strict host stack frame coordinates',async()=>{
  // This is a research proof-only edit, not the production obfuscator output.
  const key='longPrivateFieldForHost';
  const native='const owner={'+key+':47};'+
    'const result=(()=>globalThis.HOST_STACK_SPY(owner.'+key+'))();'+
    'export const observed=result;';
  const newKey='_r7';
  const naive=native.replaceAll(key,newKey);
  const padded=native.replaceAll(key,newKey.padEnd(key.length,' '));
  assert.ok(!naive.includes(key)&&!padded.includes(key));
  assert.equal(padded.length,native.length);
  assert.ok(naive.length<native.length);
  const root=await mkdtemp(path.join(tmpdir(),'obfs-arrow-coordinate-neutral-'));
  const previous=globalThis.HOST_STACK_SPY;
  try{
    globalThis.HOST_STACK_SPY=/** @type {(value:number)=>{value:number,line:number,column:number}} */(
      value=>{
        const row=new Error('host source observer').stack?.split('\n')[2]??'';
        const match=/:(\d+):(\d+)\)?$/u.exec(row);
        assert.ok(match,'Native V8 stack must include ESM callsite coordinates');
        return {value,line:Number(match[1]),column:Number(match[2])};
      }
    );
    const original=(await load(root,'balanced-native',native)).observed;
    const compressed=(await load(root,'balanced-short',naive)).observed;
    const unchangedColumn=(await load(root,'balanced-pad',padded)).observed;
    assert.notDeepEqual(compressed,original,
      'A naive shorter rewrite changes an externally captured caller column');
    assert.deepEqual(unchangedColumn,original,
      'A byte-width-preserving plain-ASCII key rewrite keeps this same-line callsite');
    assert.equal(/** @type {{value:number}} */(unchangedColumn).value,47);
    console.log(JSON.stringify({original,compressed,unchangedColumn,
      originalLength:native.length,shorterLength:naive.length,
      paddedLength:padded.length}));
  }finally{
    if(previous===undefined)delete globalThis.HOST_STACK_SPY;
    else globalThis.HOST_STACK_SPY=previous;
    await rm(root,{recursive:true,force:true});
  }
});
