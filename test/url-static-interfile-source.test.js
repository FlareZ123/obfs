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
 * Execute native or emitted ESM in a new directory so Node module caches
 * never mask changes to the actual distributed module bytes.
 * @param {ModuleFile[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-url-import-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const entry=await import(pathToFileURL(path.join(root,'observer.mjs')).href);
    return await entry.observe();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} parser @param {string} expression @param {boolean} [primitive] @returns {ModuleFile[]} */
function sourceFiles(parser,expression,primitive=false) {
  const logic=primitive?
    'const state={secretField:19};const value=state.secretField;'+
      'export function inspect(){return value;}' :
    'export function inspect(){const state={secretField:19};return state.secretField;}';
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'parser.mjs',sourceType:'module',code:parser},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'import {parseUrl} from "./parser.mjs";'+
      'export function observe(){return {text:'+expression+',value:inspect()};}'}
  ];
}

/** @param {ModuleFile[]} files @returns {ModuleFile[]} */
function transform(files) {
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'cross-file-url-static-native-source',
    properties:true,identifiers:true,strings:true
  });
  return transformed.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
}

const sourceCases=[
  ['direct immutable export','export const parseUrl=URL.parse;',
    'parseUrl(inspect,"https://example.test/").href'],
  ['aliased immutable export','const original=globalThis.URL.parse;export {original as parseUrl};',
    'parseUrl(inspect,"https://example.test/").href'],
  ['export default parser reimport','const first=URL.parse;const second=first;export {second as parseUrl};',
    'parseUrl(inspect,"https://example.test/").href']
];

for(const [name,parser,expression] of sourceCases) {
  test('cross-file imported native URL.parse preserves exact function source: '+name,async()=>{
    const before=sourceFiles(parser,expression);
    const native=await execute(before);
    assert.match(native.text,/secretField/u,name+' must expose original source');
    const counterfactual=before.map(file=>({...file,code:file.code.replaceAll(
      'secretField','changedField')}));
    assert.notDeepEqual(await execute(counterfactual),native,
      name+' must be sensitive to source spelling');
    const after=transform(before);
    assert.equal(after[0].code,before[0].code,
      'Imported native parser in a sibling module must preserve producer source');
    assert.deepEqual(await execute(after),native);
  });
}

test('imported native URL.parse with primitive inputs retains independently safe key rewrite',async()=>{
  const before=sourceFiles('export const parseUrl=URL.parse;',
    'parseUrl("/fixed","https://example.test/").href',true);
  const after=transform(before);
  assert.deepEqual(await execute(after),await execute(before));
  assert.doesNotMatch(after[0].code,/secretField/u,
    'A parser with literal inputs cannot observe an unrelated field');
});
