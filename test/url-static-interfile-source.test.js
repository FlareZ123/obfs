'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
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

/**
 * A selected Wasm function definitely changes source spelling; its source can
 * be imported by a consumer of an independently imported native parser.
 * @param {string} parserSource
 * @param {string} expression
 * @param {string|null} [baseSource]
 * @returns {ModuleFile[]}
 */
function selectedFiles(parserSource,expression,baseSource=null) {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'export function inspect(a){return a^17;}'},
    {path:'parser.mjs',sourceType:'module',code:parserSource},
    ...(baseSource===null?[]:[{path:'base.mjs',sourceType:/** @type {'module'} */ ('module'),code:baseSource}]),
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'import {parseUrl} from "./parser.mjs";'+
      'export function observe(){return {text:'+expression+',value:inspect(31)};}'}
  ];
}

/** @type {Array<[string,string,string|null]>} */
const selectedObservers=[
  ['direct export','export const parseUrl=URL.parse;',null],
  ['reexported immutable alias','const original=globalThis.URL.parse;export {original as parseUrl};',null],
  ['direct forwarded export','export {parseUrl} from "./base.mjs";','export const parseUrl=URL.parse;'],
  ['renamed forwarded export','export {nativeParse as parseUrl} from "./base.mjs";',
    'export const nativeParse=globalThis.URL.parse;'],
  ['star forwarded export','export * from "./base.mjs";','export const parseUrl=URL.parse;']
];

for(const [name,parser,base] of selectedObservers) {
  test('selected Wasm rejects imported URL parser observing a function: '+name,async()=>{
    const before=selectedFiles(parser,
      'parseUrl(inspect,"https://example.test/").href',base);
    const original=await execute(before);
    const lowered=lowerWasmI32Functions(before[0].code,'module',{
      seed:'url-import-wasm-counterfactual',names:['inspect']
    });
    assert.equal(lowered.functions,1,'Counterfactual must select a real Wasm function');
    const altered=before.map((file,i)=>i===0?{...file,code:lowered.code}:file);
    assert.notDeepEqual(await execute(altered),original,
      'Actual Wasm lowering must expose different function-source text');

    assert.throws(()=>obfuscateFiles(before,{
      mode:'coo',seed:'url-import-wasm-refusal/'+name,closedWorld:true,
      strings:false,experimentalWasmI32:{'logic.mjs':['inspect']}
    }),/Wasm i32 requires|declined/i,
    'Importing a static URL parser cannot bypass cross-file source observation');
  });
}

test('selected Wasm remains available when imported URL parser receives literals',async()=>{
  const before=selectedFiles('export const parseUrl=URL.parse;',
    'parseUrl("/fixed","https://example.test/").href');
  const transformed=obfuscateFiles(before,{
    mode:'coo',seed:'url-import-wasm-positive',closedWorld:true,
    strings:false,experimentalWasmI32:{'logic.mjs':['inspect']}
  });
  assert.equal(transformed.files[0].metrics.wasmI32Functions,1);
  const after=transformed.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  assert.deepEqual(await execute(after),await execute(before));
});

test('imported native URL.parse with primitive inputs retains independently safe key rewrite',async()=>{
  const before=sourceFiles('export const parseUrl=URL.parse;',
    'parseUrl("/fixed","https://example.test/").href',true);
  const after=transform(before);
  assert.deepEqual(await execute(after),await execute(before));
  assert.doesNotMatch(after[0].code,/secretField/u,
    'A parser with literal inputs cannot observe an unrelated field');
});
