'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * @param {boolean} privateWrapper
 * @returns {import('../src/core').SourceFile[]}
 */
function makeFiles(privateWrapper) {
  const initial='export const state={secretOffset:19,secretSalt:37};';
  const direct='export function readOffset(owner){return owner.secretOffset;}'+
    'export const readSalt=owner=>owner["secretSalt"];';
  const wrapped='function privateOffset(owner){return owner.secretOffset;}'+
    'export function readOffset(owner){return privateOffset(owner);}'+
    'const privateSalt=owner=>owner["secretSalt"];'+
    'export const readSalt=owner=>privateSalt(owner);';
  return [
    {path:'private.mjs',sourceType:'module',code:initial+(privateWrapper?wrapped:direct)},
    {path:'entry.mjs',sourceType:'module',code:
      "import {state,readOffset,readSalt} from './private.mjs';"+
      'globalThis.value=readOffset(state)+readSalt(state);'}
  ];
}

/** @param {boolean} privateWrapper @param {boolean} preserveSource @returns {number} */
function measure(privateWrapper,preserveSource) {
  return obfuscateFiles(makeFiles(privateWrapper),{
    mode:'coo',seed:'minimal-cross-exported-wrapper-proof',
    closedWorld:true,strings:false,identifiers:false,properties:true,
    preservePublicCallableSource:preserveSource
  }).crossFile.properties;
}

test('compare direct and private-wrapper interprocedural cross-file source proof',()=>{
  const rows={
    directLegacy:measure(false,false),
    directSourceSafe:measure(false,true),
    privateWrappedLegacy:measure(true,false),
    privateWrappedSourceSafe:measure(true,true)
  };
  process.stdout.write('CROSS_READER_SOURCE_BOUNDS '+JSON.stringify(rows)+'\n');
  assert.equal(rows.directLegacy,2,'Must preserve an actual cross-file owner-key positive control');
});
