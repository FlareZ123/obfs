'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {collectVerifiedImportedPrimitives}=require('../src/cross-properties');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Source */

/** @param {string} producer @returns {Source[]} */
function fourFileGraph(producer) {
  return [
    {path:'state.mjs',sourceType:'module',code:producer},
    {path:'workerA.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}'+
        'export const partial=worker(state);'},
    {path:'workerB.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',sourceType:'module',
      code:'import {state,internalValue} from "./state.mjs";'+
        'import {partial as a} from "./workerA.mjs";'+
        'import {partial as b} from "./workerB.mjs";'+
        'export const result=(+a)+(+b)+internalValue+state.secretValue;'}
  ];
}

/** @param {Source[]} files @returns {Promise<number|string>} */
async function runNative(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-adjacent-primitive-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const module=await import(pathToFileURL(path.join(root,'index.mjs')).href);
    return /** @type {number|string} */(module.result);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('adjacent literal owner field is a proven imported primitive with four-file owner-key rewrite',async()=>{
  const sources=fourFileGraph(
    'export const state={secretValue:3,otherKey:5};'+
    'export const internalValue=state.secretValue;');
  const proof=collectVerifiedImportedPrimitives(sources);
  assert.equal(proof.get('index.mjs')?.has('internalValue'),true,
    'Immutable adjacent own data field has a fixed primitive value');
  const obfuscated=obfuscateFiles(sources,{mode:'coo',seed:'adjacent-owned-primitive',
    closedWorld:true,strings:false,identifiers:false,properties:true});
  assert.equal(obfuscated.crossFile.objects,1);
  assert.equal(obfuscated.crossFile.properties,2);
  const emitted=obfuscated.files.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
  }));
  assert.equal(await runNative(sources),29);
  assert.equal(await runNative(emitted),29);
});


for(const mode of /** @type {Array<'sco'|'sno'>} */ (['sco','sno'])) {
  test('adjacent own literal primitive works in '+mode+' core output with emitted ESM parity',async()=>{
    const sources=fourFileGraph(
      'export const state={secretValue:3,otherKey:5};'+
      'export const internalValue=state.secretValue;');
    const obfuscated=obfuscateFiles(sources,{mode,seed:'adjacent-own-'+mode,
      closedWorld:true,strings:false,identifiers:false,properties:true});
    assert.equal(obfuscated.crossFile.objects,1);
    assert.equal(obfuscated.crossFile.properties,2);
    const emitted=obfuscated.files.map(file=>({
      path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
    }));
    assert.equal(await runNative(emitted),29);
  });
}

test('intervening mutation to callable keeps source-sensitive ESM stringification',async()=>{
  /** @type {Source[]} */
  const sources=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretValue:3,otherKey:5};'+
        'state.secretValue=function observed(){return 37;};'+
        'export const internalValue=state.secretValue;'},
    {path:'index.mjs',sourceType:'module',
      code:'import {internalValue} from "./state.mjs";'+
        'export const result=String(internalValue);'}
  ];
  assert.equal(collectVerifiedImportedPrimitives(sources).get('index.mjs')?.has('internalValue'),false);
  const obfuscated=obfuscateFiles(sources,{mode:'coo',
    seed:'adjacent-mutated-callable',closedWorld:true,
    strings:false,identifiers:false,properties:true});
  assert.equal(obfuscated.crossFile.objects,0);
  assert.equal(obfuscated.crossFile.properties,0);
  const emitted=obfuscated.files.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
  }));
  const observed=await runNative(sources);
  assert.match(String(observed),/function observed/);
  assert.equal(await runNative(emitted),observed);
});

test('adjacent owner primitive remains primitive with hostile inherited getter',async()=>{
  const sources=fourFileGraph(
    'Object.defineProperty(Object.prototype,"secretValue",{get(){return ()=>41;},configurable:true});'+
    'export const state={secretValue:3,otherKey:5};'+
    'export const internalValue=state.secretValue;');
  assert.equal(collectVerifiedImportedPrimitives(sources).get('index.mjs')?.has('internalValue'),true);
  // Each test's ESM module is cached under a fresh absolute path; the getter
  // affects only prototype lookup and never shadows the owner's own field.
  const emitted=obfuscateFiles(sources,{mode:'coo',seed:'own-inherited-getter',
    closedWorld:true,strings:false,identifiers:false,properties:true}).files.map(file=>({
      path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
    }));
  try {
    assert.equal(await runNative(sources),29);
    assert.equal(await runNative(emitted),29);
  }finally{
    Reflect.deleteProperty(Object.prototype,'secretValue');
  }
});


for(const [kind,literal,rendered] of /** @type {Array<[string,string,string]>} */ ([
  ['number','37','37'],
  ['boolean','true','true'],
  ['null','null','null'],
  ['string','"owned"','owned'],
  ['bigint','37n','37']
])) {
  for(const key of ['secretValue','_privateValue','toString']) {
    test('adjacent field primitive matrix '+kind+' '+key+' preserves source semantics',async()=>{
      /** @type {Source[]} */
      const sources=[
        {path:'state.mjs',sourceType:'module',
          code:'export const state={'+key+':'+literal+',otherKey:5};'+
            'export const observed=state.'+key+';'},
        {path:'index.mjs',sourceType:'module',
          code:'import {observed} from "./state.mjs";'+
            'export const result=String(observed);'}
      ];
      assert.equal(collectVerifiedImportedPrimitives(sources)
        .get('index.mjs')?.has('observed'),true);
      const obfuscated=obfuscateFiles(sources,{mode:'coo',seed:'adjacent-matrix-'+kind+key,
        closedWorld:true,strings:false,identifiers:false,properties:true});
      const emitted=obfuscated.files.map(file=>({
        path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
      }));
      assert.equal(await runNative(sources),rendered);
      assert.equal(await runNative(emitted),rendered);
    });
  }
}

for(const [label,producer] of /** @type {Array<[string,string]>} */ ([
  ['intervening object mutation',
    'export const state={secretValue:3,otherKey:5};'+
    'state.secretValue=()=>37;export const internalValue=state.secretValue;'],
  ['intervening external call',
    'export const state={secretValue:3,otherKey:5};'+
    'globalThis.mutate(state);export const internalValue=state.secretValue;'],
  ['getter instead of own data property',
    'export const state={get secretValue(){return ()=>37;},otherKey:5};'+
    'export const internalValue=state.secretValue;'],
  ['computed object key',
    'export const state={["secretValue"]:3,otherKey:5};'+
    'export const internalValue=state.secretValue;'],
  ['uninitialized forward owner reference',
    'export const internalValue=state.secretValue;'+
    'export const state={secretValue:3,otherKey:5};'],
  ['own key missing',
    'export const state={otherKey:5};export const internalValue=state.secretValue;'],
  ['nonprimitive literal owner value',
    'export const state={secretValue:()=>37,otherKey:5};'+
    'export const internalValue=state.secretValue;'],
  ['owner created by dynamic factory',
    'export const state=make();export const internalValue=state.secretValue;'+
    'function make(){return {secretValue:3,otherKey:5};}']
])) {
  test('adjacent own field primitive proof refuses '+label,()=>{
    /** @type {Source[]} */
    const sources=[
      {path:'state.mjs',sourceType:'module',code:producer},
      {path:'index.mjs',sourceType:'module',
        code:'import {internalValue} from "./state.mjs";export const result=String(internalValue);'}
    ];
    const proof=collectVerifiedImportedPrimitives(sources);
    assert.equal(proof.get('index.mjs')?.has('internalValue'),false);
  });
}
