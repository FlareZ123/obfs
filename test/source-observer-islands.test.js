'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src/core');
const {atomicWrite} = require('../src/atomic');
const {normalizePublicIsland} = require('../sims/source-island-public-normalizer');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const watched={path:'watched.mjs',sourceType:'module',
  code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'};
/** @type {SourceFile} */
const independent={path:'independent.mjs',sourceType:'module',
  code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;export function unrelated(){return valueB;}'};
/** @type {SourceFile} */
const another={path:'another.mjs',sourceType:'module',
  code:'const recordC={privateC:43};const valueC=recordC.privateC;export function third(){return valueC;}'};

/** @param {string} code @returns {SourceFile} */
function entry(code) {
  return {path:'entry.mjs',sourceType:'module',code};
}

/**
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function executeEsm(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-observer-island-'));
  try {
    for(const file of files) {
      await atomicWrite(path.join(dir,file.path),file.code);
    }
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      cwd:dir,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

const normalEntry='import {watched} from "./watched.mjs";' +
  'import {unrelated} from "./independent.mjs";' +
  'import {third} from "./another.mjs";' +
  'console.log(JSON.stringify({source:watched.toString(),a:unrelated(),b:third()}));';

test('opt-in isolated ESM property rename preserves watched source and two imported primitive calls',async ()=>{
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const seed of ['observer-island-A','observer-island-B','observer-island-C']) {
      const originals=[watched,independent,another,entry(normalEntry)];
      const options={mode,closedWorld:true,seed,strings:false,identifiers:false};
      const legacy=obfuscateFiles(originals,options);
      assert.equal(legacy.files.reduce((n,f)=>n+f.metrics.properties,0),0,
        'Default must keep conservative group-wide observer veto');

      const result=obfuscateFiles(originals,{
        ...options,experimentalSourceObserverIslands:['independent.mjs','another.mjs']
      });
      const byPath=new Map(result.files.map(f=>[f.path,f]));
      assert.equal(byPath.get('watched.mjs')?.code,watched.code);
      assert.equal(byPath.get('entry.mjs')?.code,normalEntry);
      assert.ok((byPath.get('independent.mjs')?.metrics.properties ?? 0)>=1);
      assert.ok((byPath.get('another.mjs')?.metrics.properties ?? 0)>=1);
      assert.equal(result.crossFile.properties,0,
        'Source island exception must not re-enable cross-file renaming');
      assert.equal(result.files.reduce((n,f)=>n+f.metrics.bindings,0),0,
        'Source island exception must not enable identifier rewriting');
      assert.equal(result.files.reduce((n,f)=>n+f.metrics.literals,0),0,
        'Source island exception must not enable decoder rewriting');
      const expected=await executeEsm(originals);
      assert.equal(await executeEsm(result.files),expected);
      const emitted=byPath.get('independent.mjs');
      assert.ok(emitted && typeof emitted.code==='string');
      const attacker=normalizePublicIsland(/** @type {string} */ (emitted.code));
      assert.equal(attacker.properties,emitted.metrics.properties,
        'Source-only attacker should recover each local spelling without the seed');
      assert.ok(attacker.properties>=1 && attacker.code!==emitted.code);
      assert.doesNotMatch(attacker.code,/\\b_p[a-f0-9]{10}\\b/u);
      const neutralized=result.files.map(file=>file.path==='independent.mjs' ?
        {...file,code:attacker.code} : file);
      assert.equal(await executeEsm(neutralized),expected,
        'Public-only neutralized module must preserve the same ESM behavior');
      assert.equal(JSON.parse(expected).source,'function watched(){return valueA;}');
    }
  }
});

test('source observer islands reject repeated-separator URL module aliases',()=>{
  const ambiguous=entry(
    'import {watched} from "./watched.mjs";'+
    'import {unrelated} from ".//independent.mjs";'+
    'console.log(watched.toString(),unrelated());'
  );
  assert.throws(()=>obfuscateFiles([watched,independent,ambiguous],{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer island/,
  'A browser URL with an empty path segment is not the canonical input module identity');
});

test('island proof rejects observing, exporting, reassigning or reflecting the isolated function',()=>{
  const invalidEntries=[
    'console.log(unrelated.toString());',
    'const leaked=unrelated;console.log(leaked.toString());',
    'console.log(String(unrelated));',
    'console.log(unrelated.name);',
    'console.log(unrelated.call(null));',
    'console.log(unrelated(123));',
    'console.log([unrelated][0]());',
    'console.log({unrelated});',
    'export {unrelated};',
    'globalThis.leaked=unrelated;',
    'console.log(Function.prototype.toString.call(unrelated));'
  ];
  for(const suffix of invalidEntries) {
    const source='import {unrelated} from "./independent.mjs";'+suffix;
    assert.throws(()=>obfuscateFiles([watched,independent,entry(source)],{
      mode:'coo',closedWorld:true,seed:'negative-island',strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs']
    }),/Source observer island/,'Must refuse '+suffix);
  }
});

test('island proof rejects dynamic module access, namespaces, source readers and unproved leaves',()=>{
  const badCases=[
    {code:'import * as ns from "./independent.mjs";console.log(ns.unrelated());'},
    {code:'export {unrelated} from "./independent.mjs";'},
    {code:'export * from "./independent.mjs";'},
    {code:'import("./independent.mjs").then(console.log);'},
    {code:'import {readFileSync} from "node:fs";console.log(readFileSync("./independent.mjs","utf8"));'},
    {code:'import {unrelated} from "./independent.mjs";console.log(globalThis.Function(unrelated()));'},
    {code:'import {unrelated} from "./independent.mjs";console.log(import.meta.url,unrelated());'},
    {code:'import {unrelated} from "./independent.mjs";console.log(unrelated[unknown]());'},
    {code:'import {unrelated} from "./missing.mjs";console.log(unrelated());'}
  ];
  for(const {code} of badCases) {
    assert.throws(()=>obfuscateFiles([watched,independent,entry(code)],{
      mode:'coo',closedWorld:true,seed:'negative-island',strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs']
    }),/Source observer island/,'Must reject '+code);
  }
  const impureLeaves=[
    'const recordB={privateB:23};export function unrelated(){return recordB;}',
    'const recordB={privateB:23};const valueB=recordB.privateB;console.log(valueB);export function unrelated(){return valueB;}',
    'const recordB={privateB(){return 23}};const valueB=recordB.privateB;export function unrelated(){return valueB;}',
    'const recordB={privateB:23};const valueB=recordB.privateB;export function unrelated(x){return valueB;}',
    'const recordB={privateB:23};const valueB=recordB.privateB;export async function unrelated(){return valueB;}',
    'const recordB={privateB:23};const valueB=recordB.privateB;export const unrelated=()=>valueB;'
  ];
  for(const code of impureLeaves) {
    const modified={...independent,code};
    assert.throws(()=>obfuscateFiles([watched,modified,entry(normalEntry)],{
      mode:'coo',closedWorld:true,seed:'negative-island',strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs']
    }),/Source observer island/,'Must reject impure leaf: '+code);
  }
  assert.throws(()=>obfuscateFiles([watched,independent,entry(normalEntry)],{
    mode:'coo',closedWorld:false,experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer islands require closedWorld/);
});

test('opaque Reflect.get can reconstruct a hidden Node source-file reader',async ()=>{
  // The forbidden capabilities are assembled from split literal strings and
  // retrieved reflectively. An exact ESM-only file list still leaves an
  // untracked native module loader outside the declared import graph.
  const opaqueEntry='import {watched} from "./watched.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'const C=Reflect.get(()=>{}, "con"+"structor");'+
    'const load=C(`return import("node:fs")`);'+
    'const fs=await load();'+
    'const read=Reflect.get(fs,"read"+"FileSync");'+
    'const original=read("./independent.mjs","utf8");'+
    'console.log(JSON.stringify({source:watched.toString(),n:unrelated(),'+
      'originalKey:original.includes("privateB")}));';
  const originals=[watched,independent,entry(opaqueEntry)];
  const changed=obfuscateFiles([independent],{
    mode:'coo',seed:'opaque-loader-native-control',strings:false,identifiers:false
  }).files;
  assert.equal(changed[0].metrics.properties,2,
    'Counterfactual must actually rename the source-visible file');
  const attacked=originals.map(file=>file.path==='independent.mjs' ?
    {...file,code:changed[0].code} : file);
  assert.deepEqual(JSON.parse(await executeEsm(originals)),{
    source:'function watched(){return valueA;}',n:23,originalKey:true
  });
  assert.deepEqual(JSON.parse(await executeEsm(attacked)),{
    source:'function watched(){return valueA;}',n:23,originalKey:false
  },'Unsafe isolated rewrite must demonstrate a real source-visible contract break');
  assert.throws(()=>obfuscateFiles(originals,{
    mode:'coo',seed:'opaque-loader-admission',closedWorld:true,
    strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer island/,
  'Proof must reject opaque reflective dynamic source reader');
});

test('ambient Symbol overwrite breaks naive island Symbol lowering but stays refused',async ()=>{
  /** @type {SourceFile} */
  const poison={path:'poison.mjs',sourceType:'module',
    code:'Symbol=()=>{throw new Error("patched Symbol")};'};
  const withPoison=entry('import "./poison.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'import {watched} from "./watched.mjs";'+
    'console.log(JSON.stringify({source:watched.toString(),value:unrelated()}));');
  const originals=[poison,watched,independent,withPoison];
  const native=await executeEsm(originals);
  assert.deepEqual(JSON.parse(native),{
    source:'function watched(){return valueA;}',value:23
  });
  const unsafe=obfuscateFiles([independent],{
    mode:'coo',seed:'poisoned-symbol-control',
    strings:false,identifiers:false,experimentalSymbolKeys:true
  });
  assert.equal(unsafe.files[0].metrics.symbolKeys,2,
    'Counterfactual must actually introduce native Symbol constructor calls');
  const counterfactual=originals.map(file=>file.path==='independent.mjs' ?
    {...file,code:unsafe.files[0].code} : file);
  await assert.rejects(()=>executeEsm(counterfactual),/patched Symbol/,
    'An ambient Symbol write in the earlier sibling module must poison injected initializers');
  assert.throws(()=>obfuscateFiles(originals,{
    mode:'coo',seed:'poisoned-symbol-admission',
    closedWorld:true,strings:false,identifiers:false,
    experimentalSymbolKeys:true,
    experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer islands support literal property renaming only/);
});

test('CacheStorage implicit requests and response-body readers cannot bypass source islands',()=>{
  const cacheExpressions=[
    'const box=await caches.open("source-cache");await box.add("./independent.mjs");'+
      'const response=await box.match("./independent.mjs");console.log((await response.text()).includes("privateB"));',
    'const storage=caches;const box=await storage.open("source-cache");'+
      'console.log((await box.keys()).length);',
    'console.log(CacheStorage);'
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    for(const expression of cacheExpressions) {
      const source='import {watched} from "./watched.mjs";'+
        'import {unrelated} from "./independent.mjs";'+
        'console.log(watched.toString());'+expression+
        'console.log(unrelated());';
      assert.throws(()=>obfuscateFiles([watched,independent,entry(source)],{
        mode,closedWorld:true,strings:false,identifiers:false,
        experimentalSourceObserverIslands:['independent.mjs']
      }),/Source observer island/,
      'Must refuse the undeclared implicit browser source reader in '+mode);
    }
    const simpleEntry='import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'console.log(watched.toString(),unrelated());';
    const control=obfuscateFiles([watched,independent,entry(simpleEntry)],{
      mode,closedWorld:true,strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs']
    });
    assert.ok((control.files.find(file=>file.path==='independent.mjs')?.metrics.properties??0)>=1,
      'The cache veto must preserve actual independent safe-field rewriting in '+mode);
  }
});


test('source-observer islands refuse undeclared same-origin Window.frames source readers',()=>{
  const badEntries=[
    'const view=frames["sourceView"];console.log(view["doc"+"ument"].body.textContent);',
    'const host=window;const view=host["frames"]["sourceView"];console.log(view.document.body.textContent);',
    'const view=globalThis["frames"]["sourceView"];console.log(view.document.body.textContent);',
    'export function inspectFrame(frame){return frame.contentDocument.body.textContent.includes("privateB");}',
    'export function inspectFrameWindow(frame){return frame["contentWindow"].document.body.textContent.includes("privateB");}'
  ];
  for(const source of badEntries) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      const entryFile=entry('import {watched} from "./watched.mjs";'+
        'import {unrelated} from "./independent.mjs";'+
        'console.log(watched.toString());'+source+'console.log(unrelated());');
      assert.throws(()=>obfuscateFiles([watched,independent,entryFile],{
        mode,closedWorld:true,strings:false,identifiers:false,
        experimentalSourceObserverIslands:['independent.mjs']
      }),/Source observer island/);
    }
  }
  const allowed=obfuscateFiles([watched,independent,entry(
    'import {watched} from "./watched.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'console.log(watched.toString(),unrelated());'
  )],{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  });
  assert.ok((allowed.files.find(f=>f.path==='independent.mjs')?.metrics.properties??0)>=1,
    'An unrelated pure ESM leaf must still undergo a genuine field rewrite');
});

test('source islands refuse browser ResourceTiming byte-size observers',()=>{
  const probes=[
    'const e=performance.getEntriesByType("resource");console.log(e.length);',
    'const observer=new PerformanceObserver(()=>{});'+
      'observer.observe({entryTypes:["resource"]});',
    'let method="getEntriesByType";'+
      'console.log(globalThis.performance[method]("resource"));'
  ];
  for(const probe of probes){
    const observerEntry=entry(
      'import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'console.log(watched.toString(),unrelated());'+probe
    );
    for(const mode of /** @type {const} */ (['coo','sco','sno'])){
      assert.throws(()=>obfuscateFiles([watched,independent,observerEntry],{
        mode,closedWorld:true,strings:false,identifiers:false,
        experimentalSourceObserverIslands:['independent.mjs']
      }),/Source observer islands refuse distributed source-file readers/u,
      'The selected ESM leaf exposes its emitted size through '+probe);
    }
  }
});
