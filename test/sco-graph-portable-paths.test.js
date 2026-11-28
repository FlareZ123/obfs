'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoAsyncGraph,partitionScoSelectedGraph}=require('../src');
const {safePath,createPathInventory,registerFilePath}=require('../src/portable-paths');

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


test('full Unicode casefold aliases cannot give SCO private files separate identities',()=>{
  // Unicode CaseFolding 17 maps both U+03D1 and U+03F4 to U+03B8,
  // although JS toLowerCase AND toUpperCase each keep this pair distinct.
  // Uppercase sharp S and plain ss also share a full casefold mapping.
  const unsafe=[
    ['src/'+String.fromCodePoint(0x03d1)+'.mjs','src/'+String.fromCodePoint(0x03f4)+'.mjs'],
    ['src/'+String.fromCodePoint(0x1e9e)+'.mjs','src/ss.mjs']
  ];
  for(const names of unsafe){
    assert.notEqual(names[0].normalize('NFC').toLowerCase(),
      names[1].normalize('NFC').toLowerCase());
    assert.notEqual(names[0].normalize('NFC').toUpperCase(),
      names[1].normalize('NFC').toUpperCase());
    for(const pair of [names,[...names].reverse()]){
      const inventory=createPathInventory();
      registerFilePath(inventory,safePath(pair[0]));
      assert.throws(()=>registerFilePath(inventory,safePath(pair[1])),
        /Duplicate file /u,
        'portable tree must refuse a full-casefold alias '+JSON.stringify(pair));
      assert.throws(()=>graphFor(pair),/Duplicate private graph path:/u,
        'whole graph must refuse a full-casefold alias '+JSON.stringify(pair));
      assert.throws(()=>selectedGraphFor(pair),/Case-colliding selected SCO module path:/u,
        'selected graph must refuse a full-casefold alias '+JSON.stringify(pair));
    }
  }
});

test('portable output paths reject default-ignorable code points before any filesystem operation',()=>{
  // Current Linux ext4/f2fs casefold normalization can discard these and
  // even fold dot+ignorable segments to dot or dotdot. Refuse conservatively
  // rather than relying on the host filesystem's Unicode release or patches.
  const unsafe=[
    'src/module'+String.fromCodePoint(0x200b)+'.mjs', // ZERO WIDTH SPACE
    'src/..'+String.fromCodePoint(0x202e)+'/dependency.mjs', // RLO
    'assets/name'+String.fromCodePoint(0xfe0f)+'.svg' // VS-16
  ];
  for(const filename of unsafe){
    assert.throws(()=>safePath(filename),/Default-ignorable Unicode filename/u,
      'must reject invisible or filesystem-discarded path characters');
  }
  const visible='src/visible-'+String.fromCodePoint(0x03b8)+'.mjs';
  assert.equal(safePath(visible),visible);
});
