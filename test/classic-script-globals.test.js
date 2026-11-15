'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/**
 * Run classic browser scripts in one persistent global lexical environment.
 * @param {string[]} sources
 * @returns {string}
 */
function runScripts(sources) {
  const context=vm.createContext({});
  for (const source of sources) vm.runInContext(source,context,{timeout:1000});
  return JSON.stringify([context.first,context.second]);
}

/**
 * Predict the first attempted decoder name for a seed and file.
 * @param {string} seed
 * @param {string} name
 * @returns {string}
 */
function initialHelper(seed,name) {
  const salt=createHash('sha256').update(seed+'/'+name).digest('hex');
  return '_o'+createHash('sha256').update(salt+'strings').digest('hex').slice(0,12);
}

/** @param {string[]} source @param {string} seed */
function transform(source,seed) {
  return obfuscateFiles(source.map((code,index)=>({
    path:index===0?'first.js':'second.js',sourceType:'script',code
  })),{
    mode:'coo',seed,strings:true,properties:false,identifiers:false
  }).files;
}

test('grouped classic scripts avoid a deterministic shared global helper collision',()=>{
  const seed='classic-global-helper';
  const helper=initialHelper(seed,'first.js');
  const source=[
    'globalThis.first="a-long-runtime-literal";',
    'const '+helper+'=41;globalThis.second='+helper+';'
  ];
  const result=transform(source,seed);
  assert.equal(runScripts(result.map(item=>/** @type {string} */ (item.code))),runScripts(source));
  assert.equal(result[0].metrics.literals,1);
  assert.ok(!result[0].code.includes('const '+helper+'='));
});

test('grouped classic scripts reserve Unicode-escaped global identifiers',()=>{
  const seed='classic-escaped-helper';
  const helper=initialHelper(seed,'first.js');
  const escaped='\\u005f'+helper.slice(1);
  const source=[
    'globalThis.first="long-runtime-text";',
    'const '+escaped+'=43;globalThis.second='+escaped+';'
  ];
  const result=transform(source,seed);
  assert.equal(runScripts(result.map(item=>/** @type {string} */ (item.code))),runScripts(source));
  assert.equal(result[0].metrics.literals,1);
  assert.ok(!result[0].code.includes('const '+helper+'='));
});

test('grouped scripts skip ambient String-dependent decoder under global shadowing',()=>{
  const seed='classic-shadowing';
  const source=[
    'globalThis.first="runtime-text-that-is-long";',
    'const String={};globalThis.second=43;'
  ];
  const result=transform(source,seed);
  assert.equal(result[0].metrics.literals,0);
  const reordered=[source[1],source[0]];
  const encodedReordered=[result[1].code,result[0].code].map(item=>/** @type {string} */ (item));
  assert.equal(runScripts(encodedReordered),runScripts(reordered));
});
