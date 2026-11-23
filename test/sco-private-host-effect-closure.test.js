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


test('Selected SCO refuses host-specific object URL creation and extraction',()=>{
  const cases=[
    'export async function protectedOp(){return URL.createObjectURL(new Blob(["x"]));}',
    'export async function protectedOp(){return URL["createObjectURL"](new Blob(["x"]));}',
    'export async function protectedOp(){const make=URL.createObjectURL;return make(new Blob(["x"]));}',
    'export async function protectedOp(){const U=URL;return U.createObjectURL(new Blob(["x"]));}',
    'export async function protectedOp(){const {createObjectURL:make}=URL;return make(new Blob(["x"]));}',
    'function makeUrl(){return URL.createObjectURL(new Blob(["x"]));}'+
      'export async function protectedOp(){return makeUrl();}'
  ];
  for(const source of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:source+'export function visible(){return 7;}'},
      {seed:'sco-host-object-url-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved cross-realm object URL API/u,source);
  }
});

test('Selected SCO still accepts deterministic URL parsing and inert object URL labels',()=>{
  const cases=[
    'return new URL("https://example.org/a").pathname;',
    'const record={createObjectURL:41,revokeObjectURL:1};'+
      'return record.createObjectURL+record.revokeObjectURL;'
  ];
  for(const body of cases){
    const result=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-host-object-url-positive-20261122',privateNames:['protectedOp']}
    );
    assert.deepEqual(result.privateNames,['protectedOp']);
  }
});


test('Selected SCO declines object URL access through a freshly constructed URL instance',()=>{
  const cases=[
    'return (new URL("https://example.org/a")).constructor.createObjectURL(new Blob(["x"]));',
    'const item=new URL("https://example.org/a");'+
      'return item.constructor.createObjectURL(new Blob(["x"]));',
    'const item=new URL("https://example.org/a");'+
      'return item["constructor"]["createObjectURL"](new Blob(["x"]));'
  ];
  for(const body of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-object-url-constructor-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved cross-realm object URL API/u,body);
  }
  const allowed=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',
      code:'export async function protectedOp(){'+
        'const record={constructor:{createObjectURL:()=>42}};'+
        'return record.constructor.createObjectURL();}'+
        'export function visible(){return 7;}'},
    {seed:'sco-object-url-local-constructor-20261122',privateNames:['protectedOp']}
  );
  assert.deepEqual(allowed.privateNames,['protectedOp']);
});


test('Selected SCO refuses timer APIs whose handles and callbacks belong to the caller realm',()=>{
  const cases=[
    'const id=setTimeout(()=>0,1000);clearTimeout(id);return typeof id;',
    'const id=setInterval(()=>0,1000);clearInterval(id);return typeof id;',
    'const schedule=setTimeout;const id=schedule(()=>0,1000);clearTimeout(id);return typeof id;',
    'queueMicrotask(()=>{});return 1;',
    'return requestAnimationFrame(()=>{});',
    'return requestIdleCallback(()=>{});'
  ];
  for(const body of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-private-host-timers-20261122',privateNames:['protectedOp']}
    ),/(?:Private SCO export or helper contains unproved cross-realm host API|Private SCO export uses browser-only ambient state)/u,body);
  }
  const owned=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',
      code:'export async function protectedOp(){'+
        'const data={setTimeout:40,clearTimeout:2,requestAnimationFrame:0};'+
        'return data.setTimeout+data.clearTimeout+data.requestAnimationFrame;}'+
        'export function visible(){return 7;}'},
    {seed:'sco-private-inert-timer-labels-20261122',privateNames:['protectedOp']}
  );
  assert.deepEqual(owned.privateNames,['protectedOp']);
});


test('Immutable locally owned timer-spelled helpers remain selectable',()=>{
  const selectedBodies=[
    'const setTimeout=value=>value+1;return setTimeout(41);',
    'function setInterval(value){return value+1;}return setInterval(41);',
    'const clearTimeout=function(value){return value+1;};return clearTimeout(41);'
  ];
  for(const body of selectedBodies){
    const partition=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-local-host-shadow-positive-20261122',privateNames:['protectedOp']}
    );
    assert.deepEqual(partition.privateNames,['protectedOp'],body);
  }
  const selected=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',
      code:'import {compute} from "./private/engine.mjs";'+
        'export async function protectedOp(){return compute();}'+
        'export function visible(){return 7;}'},
    {seed:'sco-static-local-host-shadow-positive-20261122',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/engine.mjs'],
      privateModuleSources:[{path:'private/engine.mjs',
        code:'const setTimeout=v=>v+1;export function compute(){return setTimeout(41);}'}]}
  );
  assert.deepEqual(selected.privateNames,['protectedOp']);
});

test('Unknown or nested timer-spelled bindings remain conservatively refused',()=>{
  const cases=[
    'const setTimeout=globalThis.setTimeout;return setTimeout(()=>0,1);',
    'const setTimeout=()=>41;function inner(setTimeout){return setTimeout();}'+
      'return inner(()=>42);',
    'function inner(){const setTimeout=()=>42;return setTimeout();}return inner();'
  ];
  for(const body of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-local-host-shadow-negative-20261122',privateNames:['protectedOp']}
    ),/unproved cross-realm host API|unproved host-global state/u,body);
  }
});



test('Mutable host-spelled function declarations are not proven local host-independent bindings',()=>{
  const cases=[
    'function setTimeout(value){return value+1;}'+
      'setTimeout=replacement;return typeof setTimeout;',
    'function setInterval(value){return value+1;}'+
      'setInterval++;return typeof setInterval;',
    'function clearTimeout(value){return value+1;}'+
      'for(clearTimeout of [42]){}return typeof clearTimeout;',
    'function setTimeout(value){return value+1;}'+
      '({setTimeout}=replacement);return typeof setTimeout;',
    'function clearInterval(value){return value+1;}'+
      'for(clearInterval in {key:42}){}return typeof clearInterval;'
  ];
  for(const body of cases){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(replacement){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-owned-function-reassignment-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper contains unproved cross-realm host API/u,body);
  }
});

test('Selected SCO requires proven local reads for freshly constructed URL values',()=>{
  const unsafe=[
    'const {constructor:C}=new URL("https://example.org/a");'+
      'return C.createObjectURL(new Blob(["x"]));',
    'const u=new URL("https://example.org/a");const {constructor:C}=u;'+
      'return C.createObjectURL(new Blob(["x"]));',
    'const u=new URL("https://example.org/a");'+
      'return ((v)=>v.constructor.createObjectURL(new Blob(["x"])))(u);',
    'const box={u:new URL("https://example.org/a")};'+
      'return box.u.constructor.createObjectURL(new Blob(["x"]));',
    'return new URL("https://example.org/a");'
  ];
  for(const body of unsafe){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-url-instance-escape-negative-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved cross-realm object URL API/u,body);
  }
  const pure=[
    'return new URL("https://example.org/a").pathname;',
    'const u=new URL("https://example.org/a");return u.pathname;',
    'const u=new URL("https://example.org/a");const v=u;return v.hostname;'
  ];
  for(const body of pure){
    const partition=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',
        code:'export async function protectedOp(){'+body+'}'+
          'export function visible(){return 7;}'},
      {seed:'sco-url-instance-escape-positive-20261122',privateNames:['protectedOp']}
    );
    assert.deepEqual(partition.privateNames,['protectedOp'],body);
  }
});


test('Selected SCO keeps explicitly server-owned timer-spelled imports and constants',()=>{
  const cases=[
    {source:'import {setTimeout} from "node:timers/promises";'+
      'export async function protectedOp(){await setTimeout(0);return 42;}'+
      'export function visible(){return 7;}',
    options:{allowServerImports:true}},
    {source:'const setInterval=42;'+
      'export async function protectedOp(){return setInterval;}'+
      'export function visible(){return 7;}',
    options:{}}
  ];
  for(const fixture of cases){
    const partition=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',code:fixture.source},
      {seed:'sco-server-owned-timer-bindings-20261122',
        privateNames:['protectedOp'],...fixture.options}
    );
    assert.deepEqual(partition.privateNames,['protectedOp'],fixture.source);
  }
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:cases[0].source},
    {seed:'sco-server-owned-timer-import-no-optin-20261122',
      privateNames:['protectedOp']}
  ),/only admits explicitly enabled named Node builtin imports/u);
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

test('SCO selected direct and static private ESM sources decline browser-only Window globals',()=>{
  const names=[
    'caches','origin','devicePixelRatio','isSecureContext',
    'crossOriginIsolated','matchMedia','requestAnimationFrame',
    'cancelAnimationFrame','requestIdleCallback','cancelIdleCallback',
    'MutationObserver','ResizeObserver','IntersectionObserver',
    'FileReader','FileList','Image','Audio','HTMLElement','Element','Node'
  ];
  for(const name of names){
    const body='return typeof '+name+';';
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency has unproved client host state/u,
        name+' in static graph / transitive='+transitive);
    }
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-browser-only-window-roots-20261122',privateNames:['protectedOp']}
    ),/Private SCO export uses browser-only ambient state/u,
    name+' in selected private export');
  }
});

test('New browser Window roots stay valid in inert object field labels',()=>{
  const body='const record={caches:1,origin:2,devicePixelRatio:3,'+
    'isSecureContext:4,crossOriginIsolated:5,matchMedia:6,'+
    'MutationObserver:7,FileReader:8,HTMLElement:9};'+
    'return record.caches+record.origin+record.devicePixelRatio+'+
    'record.isSecureContext+record.crossOriginIsolated+record.matchMedia+'+
    'record.MutationObserver+record.FileReader+record.HTMLElement;';
  for(const transitive of [false,true]){
    const generated=partitionGraph(body,transitive);
    assert.deepEqual(generated.privateNames,['protectedOp']);
  }
});


test('Static private graph admits uniquely bound literal module-local Window spellings',()=>{
  const names=['caches','origin','devicePixelRatio','isSecureContext',
    'matchMedia','FileReader','Image'];
  for(const name of names){
    for(const transitive of [false,true]){
      const code='const '+name+'=41;'+
        'export function '+(transitive?'leaf':'compute')+'(){return '+name+'+1;}';
      /** @type {ModuleSource[]} */
      const graph=[{
        path:'private/engine.mjs',
        code:transitive?
          'import {leaf} from "./deep/leaf.mjs";export function compute(){return leaf();}':
          code
      }];
      if(transitive)graph.push({path:'private/deep/leaf.mjs',code});
      const partition=partitionScoSelectedAsyncExports(
        {path:'mixed.mjs',code:entry,sourceType:'module'},
        {
          seed:'sco-static-local-browser-name-20261122',
          privateNames:['protectedOp'],
          privateModuleImports:['./private/engine.mjs'],
          privateModuleSources:graph
        }
      );
      assert.deepEqual(partition.privateNames,['protectedOp']);
      const direct=partitionScoSelectedAsyncExports(
        {path:'mixed.mjs',code:entry,sourceType:'module'},
        {seed:'sco-static-local-browser-name-20261122',
          privateNames:['protectedOp'],privateModuleImports:['./private/engine.mjs']}
      );
      assert.equal(partition.clientFile.code,direct.clientFile.code,
        'Static source admission must leave the emitted client code unchanged');
    }
  }
});

test('Static source refuses a same-named nested shadow when literal owner is ambiguous',()=>{
  const body='const caches=41;export function leaf(){'+
    'function inner(caches){return caches;}return caches+inner(1);}';
  const graph=[
    {path:'private/engine.mjs',
      code:'import {leaf} from "./deep/leaf.mjs";export function compute(){return leaf();}'},
    {path:'private/deep/leaf.mjs',code:body}
  ];
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:entry,sourceType:'module'},
    {seed:'sco-local-browser-name-ambiguous-20261122',privateNames:['protectedOp'],
      privateModuleImports:['./private/engine.mjs'],privateModuleSources:graph}),
  /SCO private static dependency has unproved client host state/u);
});


test('SCO preserves fixed server Node builtin import and refuses module-dependent imports',()=>{
  const accepted=[
    'const {createHash}=await import("node:crypto");'+
      'return createHash("sha256").update("stable").digest("hex").length;',
    'const modules=await import("node:assert/strict");'+
      'return typeof modules.equal;'
  ];
  for(const body of accepted){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-server-builtin-exception-20261122',privateNames:['protectedOp']}
    ),body);
  }
  const rejected=[
    'return import.meta.url;',
    'return await import("./private.mjs");',
    'const path="./private.mjs";return await import(path);',
    'return await import("node:module");',
    'return await import("node:vm");',
    'return await import("node:worker_threads");',
    'return await import("node:child_process");',
    'return await import("node:process");',
    'return await import("some-package");'
  ];
  for(const body of rejected){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-module-relative-private-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved module-relative execution/u,body);
  }
});

test('SCO refuses free typeof names whose browser and Node host bindings can differ',()=>{
  const names=['externalBridge','applicationSettings','extensionRuntime'];
  for(const name of names){
    const body='return typeof '+name+';';
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-free-typeof-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved free typeof reference/u,
    'selected private export: '+name);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency has unproved free typeof reference/u,
        'private graph: '+name+' transitive='+transitive);
    }
  }
});

test('SCO retains typeof of proved local primitives, formals, and standard globals',()=>{
  const sources=[
    'export async function protectedOp(value){return typeof value;}',
    'export async function protectedOp(){const local=41;return typeof local;}',
    'export async function protectedOp(){function read(value){return typeof value;}return read(41);}',
    'export async function protectedOp(){return typeof undefined;}',
    'const local=41;export async function protectedOp(){return typeof local;}'
  ];
  for(const selected of sources){
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:selected+'export function visible(){return 7;}',sourceType:'module'},
      {seed:'sco-local-typeof-20261122',privateNames:['protectedOp']}
    ),selected);
  }
  for(const body of [
    'const local=41;return typeof local;',
    'function read(value){return typeof value;}return read(41);',
    'return typeof undefined;'
  ]){
    for(const transitive of [false,true]){
      const partition=partitionGraph(body,transitive);
      assert.deepEqual(partition.privateNames,['protectedOp']);
    }
  }
});


test('Unrelated sibling binding cannot disguise a free typeof host reference',()=>{
  const body='function sibling(){const externalBridge=41;return typeof externalBridge;}'+
    'return typeof externalBridge;';
  const source='export async function protectedOp(){'+body+'}'+
    'export function visible(){return 7;}';
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:'sco-lexical-typeof-sibling-20261122',privateNames:['protectedOp']}
  ),/Private SCO export or helper uses unproved free typeof reference/u);
  for(const transitive of [false,true]){
    assert.throws(()=>partitionGraph(body,transitive),
      /SCO private static dependency has unproved free typeof reference/u);
  }
});

test('Relocated composite typeof expressions refuse evaluated free host references',()=>{
  const cases=[
    'return typeof (0,externalBridge);',
    'return typeof (externalBridge,0);',
    'return typeof externalBridge.value;',
    'return typeof externalBridge?.value;',
    'return typeof (externalBridge||null);',
    'return typeof ({captured:externalBridge});'
  ];
  for(const body of cases){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-typeof-composite-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved free typeof reference/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency has unproved free typeof reference/u,
        body+' transitive='+transitive);
    }
  }
});

test('Composite typeof local values preserve admitted direct and private-graph forms',()=>{
  const safe=[
    'const local=41;return typeof (local,1);',
    'return typeof ({captured:41}).captured;',
    'function own(value){return value;}return typeof (own,41);'
  ];
  for(const body of safe){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-composite-owned-20261122',privateNames:['protectedOp']}
    ),body);
    for(const transitive of [false,true]){
      assert.deepEqual(partitionGraph(body,transitive).privateNames,['protectedOp']);
    }
  }
});

test('SCO composite typeof distinguishes lazy nested functions from invoked closures',()=>{
  const nonExecuting=[
    'return typeof (()=>externalBridge);',
    'return typeof function(){return externalBridge;};'
  ];
  const executing=[
    'return typeof (()=>externalBridge)();',
    'return typeof (function(){return externalBridge;})();'
  ];
  for(const body of nonExecuting){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-lazy-typeof-closure-20261122',privateNames:['protectedOp']}
    ),body);
    for(const transitive of [false,true]){
      assert.deepEqual(partitionGraph(body,transitive).privateNames,['protectedOp']);
    }
  }
  for(const body of executing){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-invoked-typeof-closure-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved free typeof reference/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency has unproved free typeof reference/u,
        body+' transitive='+transitive);
    }
  }
});

test('Negative witness: composite typeof sees free names in constructed or tagged functions',()=>{
  const bodies=[
    'return typeof new (function(){return externalBridge;})();',
    'return typeof ((strings)=>externalBridge)`tag`;'
  ];
  for(const body of bodies){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-noncall-executing-typeof-20261122',privateNames:['protectedOp']}
    ),/Private SCO export or helper uses unproved free typeof reference/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /SCO private static dependency has unproved free typeof reference/u,
        body+' transitive='+transitive);
    }
  }
});

test('A nested call inside a lazy typeof closure does not execute its free read',()=>{
  const body='return typeof (()=>{Math.imul(6,7);return externalBridge;});';
  const source='export async function protectedOp(){'+body+'}'+
    'export function visible(){return 7;}';
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:'sco-lazy-nested-call-20261122',privateNames:['protectedOp']}
  ),body);
  for(const transitive of [false,true]){
    assert.deepEqual(partitionGraph(body,transitive).privateNames,['protectedOp']);
  }
});

test('SCO relocation refuses source-observable native DOMException stacks',()=>{
  const unsafe=[
    "return new DOMException('tag','InvalidStateError').stack;",
    "const error=new DOMException('tag','InvalidStateError');return error['stack'];",
    "return new WebAssembly.CompileError('tag').stack;",
    "return new WebAssembly.RuntimeError('tag')['stack'];",
    "const W=WebAssembly;const E=W.LinkError;return new E('tag').stack;",
    "const {RuntimeError:ErrorKind}=WebAssembly;return new ErrorKind('tag').stack;"
  ];
  for(const body of unsafe){
    const source='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-domexception-stack-20261122',privateNames:['protectedOp']}
    ),/realm-local.*stack/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /realm-local.*stack/u,body+' transitive='+transitive);
    }
  }
  const safe="return new DOMException('tag','InvalidStateError').name;";
  const source='export async function protectedOp(){'+safe+'}'+
    'export function visible(){return 7;}';
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:'sco-domexception-name-20261122',privateNames:['protectedOp']}
  ),safe);
  for(const transitive of [false,true]){
    assert.deepEqual(partitionGraph(safe,transitive).privateNames,['protectedOp']);
  }
});

test('SCO refuses implicit AbortError stack origins after realm relocation',()=>{
  const unsafe=[
    'const controller=new AbortController();controller.abort();return controller.signal.reason.stack;',
    'const controller=new AbortController();const alias=controller;alias.abort();return alias.signal.reason.stack;',
    'return AbortSignal.abort().reason.stack;',
    'const Signal=AbortSignal;return Signal.abort().reason.stack;',
    'const controller=new AbortController();controller.abort(undefined);return controller.signal.reason.stack;',
    'return AbortSignal.abort(void 0).reason.stack;',
    'const controller=new AbortController();controller.abort.call(controller);return controller.signal.reason.stack;',
    'const controller=new AbortController();const act=controller.abort;act.call(controller);return controller.signal.reason.stack;',
    'const act=AbortSignal.abort;return act().reason.stack;'
  ];
  for(const body of unsafe){
    const code='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code,sourceType:'module'},
      {privateNames:['protectedOp'],seed:'sco-default-abort-stack-20261122'}
    ),/realm-local.*stack/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /realm-local.*stack/u,body+' transitive='+transitive);
    }
  }
  const safe=[
    'const controller=new AbortController();controller.abort("safe");return controller.signal.reason;',
    'return AbortSignal.abort("safe").reason;',
    'const controller=new AbortController();return controller.signal.aborted;',
    'return AbortSignal.abort(null).reason;',
    'const controller=new AbortController();controller.abort(0);return controller.signal.reason;'
  ];
  for(const body of safe){
    const code='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code,sourceType:'module'},
      {privateNames:['protectedOp'],seed:'sco-explicit-abort-reason-20261122'}
    ),body);
    for(const transitive of [false,true]){
      assert.deepEqual(partitionGraph(body,transitive).privateNames,['protectedOp']);
    }
  }
});

test('SCO refuses legacy TextDecoder results with unproved host mapping tables',()=>{
  const unsafe=[
    "return new TextDecoder('windows-1252').decode(Uint8Array.of(0x80));",
    "return new TextDecoder('gbk').decode(Uint8Array.of(0xff));",
    "const Decoder=TextDecoder;return new Decoder('windows-1252').decode(Uint8Array.of(0x80));",
    "return new globalThis.TextDecoder('windows-1252').decode(Uint8Array.of(0x80));",
    "const {TextDecoder:Decoder}=globalThis;return new Decoder('gbk').decode(Uint8Array.of(0xff));",
    "const root=globalThis;return new root['TextDecoder']('gbk').decode(Uint8Array.of(0xff));",
    "const label='windows-1252';return new TextDecoder(label).decode(Uint8Array.of(0x80));",
    "const Decoder=(new TextDecoder('utf-8')).constructor;return new Decoder('windows-1252').decode(Uint8Array.of(0x80));",
    "const decoder=new TextDecoder('utf-8');const Decoder=decoder.constructor;return new Decoder('gbk').decode(Uint8Array.of(0xff));",
    "const Decoder=Reflect.get(new TextDecoder('utf-8'),'constructor');return new Decoder('windows-1252').decode(Uint8Array.of(0x80));",
    "const Decoder=Object.getPrototypeOf(new TextDecoder('utf-8')).constructor;return new Decoder('windows-1252').decode(Uint8Array.of(0x80));",
    "const decoder=new TextDecoder('utf-8');return decoder['constructor']('windows-1252');",
    "const wrapper={decoder:new TextDecoder('utf-8')};return new wrapper.decoder.constructor('windows-1252').decode(Uint8Array.of(0x80));",
    "function unrelated(){const decoder=new TextDecoder('utf-8');return decoder.decode(Uint8Array.of(65));}return decoder.decode(Uint8Array.of(66));",
    "if(true){const decoder=new TextDecoder('utf-8');decoder.decode(Uint8Array.of(65));}return decoder.decode(Uint8Array.of(66));",
    "const decoder=new TextDecoder('utf-8');decoder.encoding='custom';return decoder.decode(Uint8Array.of(65));",
    "const decoder=new TextDecoder('utf-8');decoder.fatal++;return decoder.decode(Uint8Array.of(65));",
    "try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(0x80));}catch(error){return error.message;}",
    "try{return new TextDecoder('utf-8').decode('bad');}catch(error){return error.message;}",
    "return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(0x80));",
    "return new TextDecoder('utf-8').decode('bad');",
    "const decoder=new TextDecoder('utf-8');return decoder.decode(null);",
    "return new TextDecoder('utf-8').decode([]);",
    "const decoder=new TextDecoder('utf-8',{fatal:true});return decoder.decode(Uint8Array.of(0x80));",
    "const decoder=new TextDecoder('utf-8',{fatal:true});const alias=decoder;return alias.decode(Uint8Array.of(0x80));",
    "return new TextDecoder('utf-8',{fatal:true}).decode(bytes);",
    "return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65),{stream:true});",
    "const input='bad';return new TextDecoder('utf-8').decode(input);",
    "const input=[];const decoder=new TextDecoder('utf-8');return decoder.decode(input);",
    "const data='bad';const decoder=new TextDecoder('UTF8');const alias=decoder;return alias.decode(data);"
  ];
  for(const body of unsafe){
    const code='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code,sourceType:'module'},
      {seed:'sco-crosshost-textdecoder-20261122',privateNames:['protectedOp']}
    ),/unproved cross-realm text decoding/u,body);
    for(const transitive of [false,true]){
      assert.throws(()=>partitionGraph(body,transitive),
        /unproved cross-realm text decoding|realm-local prototype access|unproved runtime loader via constructor/u,
        body+' transitive='+transitive);
    }
  }
  const safe=[
    "return new TextDecoder().decode(Uint8Array.of(65,66));",
    "return new TextDecoder('utf-8').decode(Uint8Array.of(65,66));",
    "return new TextDecoder('UTF8',{fatal:true}).decode(Uint8Array.of(65));",
    "return new TextDecoder('utf-8',{ignoreBOM:true}).decode(Uint8Array.of(65));",
    "const record={TextDecoder:41};return record.TextDecoder;",
    "const decoder=new TextDecoder('utf-8');return decoder.decode(Uint8Array.of(65,66));",
    "const decoder=new TextDecoder('UTF8');const alias=decoder;return alias.decode(Uint8Array.of(65,66));",
    "function nested(){const decoder=new TextDecoder('utf-8');return decoder.decode(Uint8Array.of(65));}return nested();",
    "{const decoder=new TextDecoder('utf-8');return decoder.decode(Uint8Array.of(65));}",
    "return new TextDecoder('utf-8').encoding;",
    "const decoder=new TextDecoder('UTF8',{fatal:true});return decoder.fatal;",
    "const decoder=new TextDecoder('utf-8',{ignoreBOM:true});return decoder.ignoreBOM;",
    "const decoder=new TextDecoder('UTF8');const alias=decoder;return alias['encoding'];",
    "return new TextDecoder('UTF8',{fatal:false}).decode(Uint8Array.of(0x80));",
    "const decoder=new TextDecoder('utf-8',{fatal:true});return decoder.decode(Uint8Array.of(65));",
    "const decoder=new TextDecoder('utf-8',{fatal:true});const alias=decoder;return alias.decode(Uint8Array.of(66));",
    "const decoder=new TextDecoder('utf-8');const value=decoder.encoding;return value;"
  ];
  for(const body of safe){
    const code='export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}';
    assert.doesNotThrow(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code,sourceType:'module'},
      {seed:'sco-utf8-textdecoder-20261122',privateNames:['protectedOp']}
    ),body);
    for(const transitive of [false,true]){
      assert.deepEqual(partitionGraph(body,transitive).privateNames,['protectedOp']);
    }
  }
});
