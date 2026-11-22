'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

const entry=[
  'import {compute} from "./private/engine.mjs";',
  'export async function protectedOp(){return compute();}',
  'export function visible(){return 7;}'
].join('\n');

/** @typedef {{path:string,code:string}} ModuleSource */

/**
 * @param {string} leafBody
 * @param {boolean} [transitive]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partitionGraph(leafBody,transitive=false){
  /** @type {ModuleSource[]} */
  const graph=[{
    path:'private/engine.mjs',
    code:transitive?
      'import {leaf} from "./deep/leaf.mjs";export function compute(){return leaf();}':
      'export function compute(){'+leafBody+'}'
  }];
  if(transitive)graph.push({
    path:'private/deep/leaf.mjs',
    code:'export function leaf(){'+leafBody+'}'
  });
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:entry,sourceType:'module'},
    {
      seed:'sco-private-host-effects-transitive-20261116',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/engine.mjs'],
      privateModuleSources:graph
    }
  );
}

test('Private source audit refuses locale, timezone, entropy and clock effects across static ESM dependencies',()=>{
  const sensitive=[
    'return new Date(2020,0,1).toISOString();',
    "return Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;",
    'return new Date(0).getHours();',
    'return (1234.5).toLocaleString();',
    "return 'z'.localeCompare('ä');",
    "return 'I'.toLocaleLowerCase();",
    'return Math.random();',
    'const r=Math.random;return r();',
    'return crypto.randomUUID();',
    'return performance.now();',
    'return performance.timeOrigin;',
    "return Intl.NumberFormat.supportedLocalesOf(['de-DE']).length;"
  ];
  for(const body of sensitive){
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency contains realm-local (?:configuration|entropy|clock|intrinsic state)/,
        body+' / transitive='+transitive);
    }
  }
});

test('Private static graph admits explicitly UTC and deterministic computation controls',()=>{
  const safe=[
    'return new Date(0).getUTCFullYear();',
    "return new Date('2020-01-01T00:00:00.000Z').toISOString();",
    'return Math.imul(7,9);',
    'return (1234.5).toString();',
    'return 41+1;'
  ];
  for(const body of safe){
    for(const transitive of [false,true]){
      const emitted=partitionGraph(body,transitive);
      assert.deepEqual(emitted.privateNames,['protectedOp'],body);
      assert.deepEqual(emitted.clientFile.privateModulePaths,
        transitive?['private/engine.mjs','private/deep/leaf.mjs']:['private/engine.mjs']);
      assert.doesNotMatch(emitted.clientFile.code,/import \{compute\}|export function compute|export function leaf/u);
    }
  }
});

test('Legacy manifest-only SCO path has no source evidence for host effects',()=>{
  const emitted=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:entry,sourceType:'module'},
    {
      seed:'sco-private-host-effects-transitive-20261116',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/engine.mjs']
    }
  );
  assert.deepEqual(emitted.clientFile.privateModulePaths,['private/engine.mjs']);
  assert.equal(emitted.privateSourceDigests,undefined);
});

test('Private static dependencies refuse unproved cross-realm browser host APIs',()=>{
  const sensitive=[
    'return fetch("./client-resource.json").then(response=>response.status);',
    'const load=fetch;return load("./client-resource.json");',
    'return new Request("./client-resource.json").url;',
    'return new Worker("./private/worker.mjs",{type:"module"});',
    'return new WebSocket("wss://example.invalid/feed");',
    'return new XMLHttpRequest();',
    'return new EventSource("/events");',
    'return new BroadcastChannel("shared-state");',
    'return new MessageChannel();'
  ];
  for(const body of sensitive){
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency contains unproved cross-realm host API/u,
        body+' / transitive='+transitive);
    }
  }
});

test('Host API spellings remain permitted as inert private-record property labels',()=>{
  const body='const record={fetch:41,Request:0,Worker:1,WebSocket:0};'+
    'return record.fetch+record.Request+record.Worker+record.WebSocket;';
  for(const transitive of [false,true]){
    const emitted=partitionGraph(body,transitive);
    assert.deepEqual(emitted.privateNames,['protectedOp']);
  }
});

test('Selected SCO refuses direct private exports and helpers with migrated host APIs',()=>{
  const cases=[
    'export async function protectedOp(){return fetch("./client-data.json");}',
    'function helper(){return fetch("./client-data.json");}'+
      'export async function protectedOp(){return helper();}',
    'export async function protectedOp(){return new Worker("./worker.mjs");}',
    'export async function protectedOp(){return new Request("./client-data.json").url;}',
    'export async function protectedOp(){console.info("CLIENT_LOG");return 7;}',
    'function helper(){console.warn("CLIENT_LOG");return 7;}'+
      'export async function protectedOp(){return helper();}',
    'export async function protectedOp(){debugger;return 7;}',
    'function helper(){return new WebSocket("wss://example.invalid/stream");}'+
      'export async function protectedOp(){return helper();}'
  ];
  for(const source of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:source+'export function visible(){return 7;}'},
      {seed:'sco-direct-cross-realm-host-api-20261121',privateNames:['protectedOp']}
    ),/Private SCO export or helper contains unproved cross-realm host API/u,source);
  }
  const inert='export async function protectedOp(){'+
    'const record={fetch:41,Request:0,Worker:1,console:0,debugger:0};'+
    'return record.fetch+record.Request+record.Worker+'+
    'record.console+record.debugger;}'+
    'export function visible(){return 7;}';
  const partition=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:inert},
    {seed:'sco-direct-inert-host-api-label-20261121',privateNames:['protectedOp']}
  );
  assert.deepEqual(partition.privateNames,['protectedOp']);
});



test('Selected SCO refuses relocated module URLs and dynamic imports in private code',()=>{
  const cases=[
    'export async function protectedOp(){return import.meta.url;}',
    'function moduleUrl(){return import.meta.url;}'+
      'export async function protectedOp(){return moduleUrl();}',
    'export async function protectedOp(){return import("./client-data.mjs");}',
    'function loadClient(){return import("./client-data.mjs");}'+
      'export async function protectedOp(){return loadClient();}'
  ];
  for(const source of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:source+'export function visible(){return 7;}'},
      {seed:'sco-private-relative-module-source-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved module-relative execution/u,source);
  }
});

test('Private static ESM graph refuses browser-only ambient objects in direct and transitive leaves',()=>{
  const sensitive=[
    'return localStorage.getItem("session");',
    'return sessionStorage.getItem("session");',
    'return indexedDB.databases();',
    'return history.length;',
    'return screen.width;',
    'return customElements.get("x-widget");',
    'return new DOMParser().parseFromString("<p>ok</p>","text/html").body.textContent;',
    'return new XMLHttpRequest().readyState;'
  ];
  for(const body of sensitive){
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency (?:has unproved client host state|contains unproved cross-realm host API)/u,
        body+' / transitive='+transitive);
    }
  }
});

test('Private source audit keeps browser API spellings in inert record keys eligible',()=>{
  const body='const data={localStorage:10,sessionStorage:11,indexedDB:12,'+
    'history:3,screen:2,customElements:4,DOMParser:0,XMLHttpRequest:0};'+
    'return data.localStorage+data.sessionStorage+data.indexedDB+'+
    'data.history+data.screen+data.customElements+data.DOMParser+data.XMLHttpRequest;';
  for(const transitive of [false,true]){
    const partition=partitionGraph(body,transitive);
    assert.deepEqual(partition.privateNames,['protectedOp']);
  }
});
