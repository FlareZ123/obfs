'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoAsyncGraph,partitionScoSelectedGraph}=require('../src');

/**
 * Build a private graph whose exports are intentionally simple, so any
 * rejection is attributable to its path inventory rather than its ESM AST.
 * @param {string[]} names
 * @returns {import('../src/sco-graph').ScoGraphPartition}
 */
function graphFor(names){
  return partitionScoAsyncGraph(names.map(path=>({
    path,sourceType:'module',
    code:'export async function run(){return 7;}'
  })),{
    seed:'agent31-portable-private-graph-20261128',
    exposedPaths:[names[0]]
  });
}

test('SCO graph admits two distinct canonical nested module paths',()=>{
  const graph=graphFor(['one/api.mjs','one/private.mjs','two/other.mjs']);
  assert.deepEqual(graph.exposedPaths,['one/api.mjs']);
  assert.deepEqual(graph.privatePaths,['one/private.mjs','two/other.mjs']);
  assert.equal(graph.clientFiles.length,1);
});

test('SCO graph refuses filesystem-aliasing module paths before source publication',()=>{
  const unsafe=[
    // NFC-equivalent names are aliases on common macOS volumes.
    ['src/\u00e9.mjs','src/e\u0301.mjs'],
    // Lowercase alone misses Unicode final sigma (uppercase agrees).
    ['src/\u03c2.mjs','src/\u03c3.mjs'],
    // The full paths differ, but the directory components may alias.
    ['Private/api.mjs','private/secret.mjs'],
    // This cannot be represented in a real filesystem as two regular files.
    ['entry.mjs','entry.mjs/dependency.mjs']
  ];
  for(const names of unsafe){
    assert.throws(()=>graphFor(names),
      /Duplicate private graph path:|Ambiguous directory spelling:|File conflicts with directory:/u,
      'must reject path aliases: '+JSON.stringify(names));
    assert.throws(()=>graphFor([...names].reverse()),
      /Duplicate private graph path:|Ambiguous directory spelling:|File conflicts with directory:/u,
      'must reject aliases in reverse file order: '+JSON.stringify(names));
  }
});

/**
 * @param {string[]} names
 * @returns {import('../src/sco-selected-graph').ScoSelectedGraph}
 */
function selectedGraphFor(names){
  const source='export async function secret(value){return value+1;}'+
    'export function local(value){return value;}';
  return partitionScoSelectedGraph(names.map(path=>({
    file:{path,code:source,sourceType:'module'},
    options:{privateNames:['secret'],seed:'agent31-portable-selected-graph'}
  })));
}

test('selected SCO graph shares the portable path inventory contract',()=>{
  assert.equal(selectedGraphFor(['src/a.mjs','src/b.mjs']).clientFiles.length,2);
  const unsafe=[
    ['src/\\u00e9.mjs','src/e\\u0301.mjs'],
    ['src/\\u03c2.mjs','src/\\u03c3.mjs'],
    ['Private/api.mjs','private/secret.mjs'],
    ['entry.mjs','entry.mjs/dependency.mjs']
  ].map(pair=>pair.map(name=>name.replace(/\\u([0-9a-f]{4})/gu,
    (whole,hex)=>String.fromCharCode(Number.parseInt(hex,16)))));
  for(const names of unsafe){
    assert.throws(()=>selectedGraphFor(names),
      /Case-colliding selected SCO module path:|Ambiguous directory spelling:|File conflicts with directory:/u,
      'must reject selected graph alias: '+JSON.stringify(names));
    assert.throws(()=>selectedGraphFor([...names].reverse()),
      /Case-colliding selected SCO module path:|Ambiguous directory spelling:|File conflicts with directory:/u,
      'must reject selected graph alias in reverse order: '+JSON.stringify(names));
  }
});
