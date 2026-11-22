'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Compare actual module loading and host string coercion with isolated paths.
 * CSS.escape's Web IDL argument conversion is reproduced by the injected
 * lexical CSS namespace. Actual native CSS identifier escaping is covered
 * separately by test/css-escape-source-browser.js.
 * @param {ModuleFile[]} files
 * @returns {Promise<{observed:string,value:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'css-escape-graph-'));
  try {
    for(const file of files)
      await atomicWrite(path.join(directory,file.path),file.code);
    const observer=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return await observer.observe();
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} expression @param {boolean} [primitive] @returns {ModuleFile[]} */
function sourceGraph(expression,primitive=false) {
  const logic=primitive?
    'const state={secretField:19};const value=state.secretField;'+
      'export function inspect(){return value;}':
    'export function inspect(){const state={secretField:19};return state.secretField;}';
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'const CSS={escape:function(value){return String(value);}};'+
      'export function observe(){return {observed:'+expression+',value:inspect()};}'}
  ];
}

/** @param {ModuleFile[]} files @returns {ModuleFile[]} */
function emit(files) {
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'css-escape-cross-graph',
    properties:true,strings:true,identifiers:true
  });
  return result.files.map(file=>({
    path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
  }));
}

for(const [name,expression] of /** @type {[string,string][]} */([
  ['direct CSS.escape','CSS.escape(inspect)'],
  ['detached CSS.escape','(()=>{const escape=CSS.escape;return escape(inspect);})()'],
  ['destructured CSS.escape','(()=>{const {escape:fromCss}=CSS;return fromCss(inspect);})()'],
  ['bound CSS.escape','(()=>{const escape=CSS.escape.bind(CSS);return escape(inspect);})()']
])) {
  test('cross-file CSS.escape source observer: '+name,async()=>{
    const original=sourceGraph(expression);
    const transformed=emit(original);
    assert.equal(transformed[0].code,original[0].code,'Exporting function must be unchanged');
    const native=await execute(original);
    assert.ok(native.observed.includes('secretField'),name);
    assert.equal(native.value,19);
    assert.deepEqual(await execute(transformed),native,name);
  });
}

test('cross-file CSS.escape primitive input retains independent own-key renaming',async()=>{
  const original=sourceGraph('CSS.escape("literal")',true);
  const transformed=emit(original);
  assert.ok(!transformed[0].code.includes('secretField'),
    'Unrelated private field must remain eligible for renaming');
  assert.deepEqual(await execute(transformed),await execute(original));
});
