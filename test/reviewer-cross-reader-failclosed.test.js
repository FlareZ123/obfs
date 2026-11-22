'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {string} ownerSource @returns {number} */
function rewritten(ownerSource) {
  return obfuscateFiles([
    {path:'private.mjs',sourceType:'module',code:
      'export const state={secretOffset:19};'+ownerSource},
    {path:'entry.mjs',sourceType:'module',code:
      "import {state,readOffset} from './private.mjs';"+
      'globalThis.observed=readOffset(state);'}
  ],{mode:'coo',closedWorld:true,seed:'one-hop-reader-adversarial',
      properties:true,identifiers:false,strings:false,
      preservePublicCallableSource:true}).crossFile.properties;
}

test('one-hop private ESM reader proof declines exposed, side-effectful and ambiguous helpers',()=>{
  const helper='function privateOffset(owner){return owner.secretOffset;}';
  const publicReader='export function readOffset(owner){return privateOffset(owner);}';
  assert.equal(rewritten(helper+publicReader),1,
    'A single private unary direct-call reader must really rename its owner key');
  const unsafe=[
    ['leaked helper source',helper+publicReader+'globalThis.leak=privateOffset;'],
    ['exported helper source',helper+publicReader+'export {privateOffset};'],
    ['second helper call',helper+publicReader+'privateOffset(state);'],
    ['helper reassignment',helper+publicReader+
      'privateOffset=function(owner){return owner.secretOffset;};'],
    ['helper with extra effect',
      'function privateOffset(owner){globalThis.extra=1;return owner.secretOffset;}'+publicReader],
    ['helper wrapper uses .call',helper+
      'export function readOffset(owner){return privateOffset.call(null,owner);}'],
    ['wrapper forwards nonformal state',helper+
      'export function readOffset(owner){return privateOffset(state);}'],
    ['wrapper reflects owner in an extra argument',
      'function privateOffset(owner,unused){return owner.secretOffset;}'+
      'export function readOffset(owner){return privateOffset(owner,Object.keys(owner));}'],
    ['helper captured by exported arrow',helper+publicReader+
      'export const reveal=()=>privateOffset;'],
    ['nested helper not proven',
      'export function readOffset(owner){function hidden(x){return x.secretOffset;}'+
      'return hidden(owner);}']
  ];
  for(const [label,source] of unsafe) {
    assert.equal(rewritten(source),0,
      String(label)+' must conservatively decline cross-file owner rename');
  }
});
