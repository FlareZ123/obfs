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
 * @param {string} [parserImport]
 * @returns {ModuleFile[]}
 */
function selectedFiles(parserSource,expression,baseSource=null,
  parserImport='import {parseUrl} from "./parser.mjs";') {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'export function inspect(a){return a^17;}'},
    {path:'parser.mjs',sourceType:'module',code:parserSource},
    ...(baseSource===null?[]:[{path:'base.mjs',sourceType:/** @type {'module'} */ ('module'),code:baseSource}]),
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      parserImport+
      'export function observe(){return {text:'+expression+',value:inspect(31)};}' }
  ];
}

/** @type {Array<[string,string,string|null]>} */
const selectedObservers=[
  ['direct export','export const parseUrl=URL.parse;',null],
  ['reexported immutable alias','const original=globalThis.URL.parse;export {original as parseUrl};',null],
  ['direct forwarded export','export {parseUrl} from "./base.mjs";','export const parseUrl=URL.parse;'],
  ['renamed forwarded export','export {nativeParse as parseUrl} from "./base.mjs";',
    'export const nativeParse=globalThis.URL.parse;'],
  ['star forwarded export','export * from "./base.mjs";','export const parseUrl=URL.parse;'],
  ['node:url named constructor','import {URL as NativeURL} from "node:url";export const parseUrl=NativeURL.parse;',null],
  ['node:url namespace constructor','import * as urlNs from "node:url";export const parseUrl=urlNs.URL.parse;',null],
  ['node:url default constructor','import nodeUrl from "node:url";export const parseUrl=nodeUrl.URL.parse;',null]
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

for(const [name,importLine,expression] of [
  ['namespace import','import * as API from "./parser.mjs";',
    'API.parseUrl(inspect,"https://example.test/").href'],
  ['namespace local method extraction','import * as API from "./parser.mjs";',
    '(()=>{const read=API.parseUrl;return read(inspect,"https://example.test/").href;})()'],
  ['namespace computed method','import * as API from "./parser.mjs";',
    '(()=>{const key="parseUrl";return API[key](inspect,"https://example.test/").href;})()']
]) {
  test('selected Wasm rejects native URL parser through imported namespace: '+name,async()=>{
    const before=selectedFiles('export const parseUrl=URL.parse;',expression,null,importLine);
    const original=await execute(before);
    assert.match(original.text,/inspect/u,'Native function source witness');
    const lowered=lowerWasmI32Functions(before[0].code,'module',{
      seed:'url-import-namespace-wasm-counterfactual',names:['inspect']
    });
    assert.equal(lowered.functions,1);
    assert.notDeepEqual(await execute(before.map((f,i)=>i===0?{...f,code:lowered.code}:f)),
      original,'Actual Wasm emitter changes native URL observation');
    assert.throws(()=>obfuscateFiles(before,{
      mode:'coo',seed:'url-import-namespace-wasm/'+name,closedWorld:true,
      strings:false,experimentalWasmI32:{'logic.mjs':['inspect']}
    }),/Wasm i32 requires|declined/i);
  });
}

test('selected Wasm remains eligible with imported namespace parser literal input',async()=>{
  const before=selectedFiles('export const parseUrl=URL.parse;',
    'API.parseUrl("/fixed","https://example.test/").href',null,
    'import * as API from "./parser.mjs";');
  const result=obfuscateFiles(before,{
    mode:'coo',seed:'url-import-namespace-primitive',
    closedWorld:true,strings:false,
    experimentalWasmI32:{'logic.mjs':['inspect']}
  });
  assert.equal(result.files[0].metrics.wasmI32Functions,1);
  assert.deepEqual(await execute(result.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }))),await execute(before));
});

/**
 * @param {string} importLine
 * @param {string} expression
 * @returns {ModuleFile[]}
 */
function directNodeUrlFiles(importLine,expression) {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'export function inspect(a){return a^17;}'},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+importLine+
      'export function observe(){return {text:'+expression+',value:inspect(31)};}'}
  ];
}

for(const [name,importLine,expression] of [
  ['named URL','import {URL as NativeURL} from "node:url";',
    'NativeURL.parse(inspect,"https://example.test/").href'],
  ['namespace URL','import * as URLLib from "node:url";',
    'URLLib.URL.parse(inspect,"https://example.test/").href'],
  ['default URL','import URLLib from "node:url";',
    'URLLib.URL.parse(inspect,"https://example.test/").href']
]) {
  test('direct node:url static parser in observer refuses selected cross-file Wasm: '+name,
    async()=>{
      const before=directNodeUrlFiles(importLine,expression);
      const original=await execute(before);
      assert.match(original.text,/inspect/u);
      const reduced=lowerWasmI32Functions(before[0].code,'module',{
        seed:'url-direct-import-wasm-counterfactual',names:['inspect']
      });
      assert.equal(reduced.functions,1);
      assert.notDeepEqual(await execute(before.map((file,i)=>
        i===0?{...file,code:reduced.code}:file)),original,
      'Real selected Wasm source changes the native URL observation');
      assert.throws(()=>obfuscateFiles(before,{
        mode:'coo',seed:'url-direct-node-import-observer/'+name,
        closedWorld:true,strings:false,
        experimentalWasmI32:{'logic.mjs':['inspect']}
      }),/Wasm i32 requires|declined/i);
    });
}

test('direct node:url parser with primitive input admits selected Wasm',async()=>{
  const before=directNodeUrlFiles('import {URL as NativeURL} from "node:url";',
    'NativeURL.parse("/fixed","https://example.test/").href');
  const transformed=obfuscateFiles(before,{
    mode:'coo',seed:'url-direct-node-literal',closedWorld:true,strings:false,
    experimentalWasmI32:{'logic.mjs':['inspect']}
  });
  assert.equal(transformed.files[0].metrics.wasmI32Functions,1);
  assert.deepEqual(await execute(transformed.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }))),await execute(before));
});

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
