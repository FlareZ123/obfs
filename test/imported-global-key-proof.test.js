'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {collectVerifiedImportedStrings,renameCrossFileProperties}=require('../src/cross-properties');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/cross-properties').SourceFile} SourceFile */

/**
 * An import's immutable literal is an exact source-observation key fact,
 * even when it is unrelated to the owner field subject to renaming.
 * @param {string} exportedValue
 * @param {string} [extra]
 * @returns {SourceFile[]}
 */
function graph(exportedValue,extra=''){
  return [
    {path:'state.mjs',sourceType:'module',
      code:`export const key=${JSON.stringify(exportedValue)};export const state={secretField:23};`},
    {path:'main.mjs',sourceType:'module',
      code:'import {state,key} from "./state.mjs";'+
        'console.log(state.secretField,globalThis[key]);'+extra}
  ];
}

test('verified imported unrelated key preserves separate owner-field proof',()=>{
  const files=graph('otherGlobal');
  const verified=collectVerifiedImportedStrings(files);
  assert.equal(verified.get('main.mjs')?.get('key'),'otherGlobal');
  const consumer=parse(/** @type {string} */ (files[1].code),'module');
  assert.equal(observesFunctionSource(consumer,verified.get('main.mjs')),false,
    'A verified primitive import must not be an opaque source-coercing function');
  assert.equal(observesDistributedSource(consumer,verified.get('main.mjs')),false,
    'A verified unrelated global property must not be a dynamic source loader');

  const cross=renameCrossFileProperties(files,'verified-global-key-proof');
  assert.equal(cross.objects,1);
  assert.equal(cross.properties,1);
  assert.ok(!cross.files[0].code.includes('secretField'));
  assert.ok(!cross.files[1].code.includes('secretField'));
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:true,
    seed:'verified-global-key-proof'
  });
  assert.equal(compiled.crossFile.properties,1);
});

test('verified imported source-capable global names still fail closed',()=>{
  for(const key of ['fetch','require','module','Function']){
    const files=graph(key);
    const verified=collectVerifiedImportedStrings(files);
    const consumer=parse(/** @type {string} */(files[1].code),'module');
    const sourceObserver=observesDistributedSource(consumer,verified.get('main.mjs'));
    const compilerHazard=key==='Function';
    assert.ok(sourceObserver||compilerHazard,
      'A known source reader or dynamic constructor must remain recognized: '+key);
    const cross=renameCrossFileProperties(files,'forbidden-'+key);
    assert.equal(cross.properties,0,key);
  }
});

test('unproved imported global key stays a dynamic-loader refusal',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export let key="otherGlobal";export const state={secretField:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state,key} from "./state.mjs";'+
        'console.log(state.secretField,globalThis[key]);'}
  ];
  const verified=collectVerifiedImportedStrings(files);
  assert.equal(verified.get('main.mjs')?.has('key'),false);
  const consumer=parse(/** @type {string} */(files[1].code),'module');
  assert.equal(observesDistributedSource(consumer,verified.get('main.mjs')),true);
  assert.equal(renameCrossFileProperties(files,'unproved-global-key').properties,0);
});
