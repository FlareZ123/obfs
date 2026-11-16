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
        transitive?['private/deep/leaf.mjs','private/engine.mjs']:['private/engine.mjs']);
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
