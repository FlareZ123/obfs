'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {proveSourceObserverIslands}=require('../src/source-observer-islands');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const leaf={
  path:'leaf.mjs',sourceType:'module',
  code:'const record={privateField:23};const value=record.privateField;export function leaf(){return value;}'
};

/**
 * A browser WindowProxy root exposes same-origin Document. An ESM consumer
 * can use it to create a modulepreload link carrying the original leaf's
 * SHA-256 SRI digest. This is an exact *source-byte* observer even though
 * the only declared imported use is a direct zero-argument call returning 23.
 *
 * @param {string} root
 * @returns {SourceFile[]}
 */
function sourceObservedGraph(root) {
  return [leaf,{
    path:'entry.mjs',sourceType:'module',
    code:[
      "import {leaf} from './leaf.mjs';",
      'void leaf();',
      'const browserHost='+root+';',
      "const dom=browserHost['document'];",
      "const element=dom.createElement('link');",
      "element.rel='modulepreload';",
      "element.href='./leaf.mjs?integrity=1';",
      "element.integrity='sha256-';",
      "dom.head.appendChild(element);"
    ].join('\n')
  }];
}

for(const root of ['top','parent','opener','frameElement']) {
  test('experimental island refuses source-observing ambient '+root,()=>{
    const graph=sourceObservedGraph(root);
    assert.throws(
      ()=>proveSourceObserverIslands(graph,['leaf.mjs']),
      /source|loader|opaque|island/i,
      root+' may expose host Document and preserve a source-byte pin');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      assert.throws(
        ()=>obfuscateFiles(graph,{
          mode,closedWorld:true,
          experimentalSourceObserverIslands:['leaf.mjs'],
          properties:true,identifiers:false,strings:false,
          seed:'agent5-source-island-windowproxy-'+root
        }),/source|loader|opaque|island/i,mode+'/'+root);
    }
  });
}

test('non-observing closed ESM primitive leaf retains genuine rewrite yield in every mode',()=>{
  /** @type {SourceFile[]} */
  const graph=[leaf,{
    path:'entry.mjs',sourceType:'module',
    code:"import {leaf} from './leaf.mjs';console.log(leaf());"
  }];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const compiled=obfuscateFiles(graph,{
      mode,closedWorld:true,
      experimentalSourceObserverIslands:['leaf.mjs'],
      properties:true,identifiers:false,strings:false,
      seed:'agent5-source-island-windowproxy-positive'
    });
    const output=compiled.files.find(file=>file.path==='leaf.mjs');
    assert.ok(output,mode);
    assert.ok(output.metrics.properties>=1,mode+': no actual rewrite');
    assert.ok(!output.code.includes('privateField'),mode+': static private field not renamed');
  }
});

test('private own keys named as WindowProxy globals are not global root accesses',()=>{
  /** @type {SourceFile[]} */
  const graph=[{
    path:'leaf.mjs',sourceType:'module',
    code:[
      'const record={top:23,parent:7,opener:19,frameElement:5};',
      'const value=record.top;',
      'export function leaf(){return value;}'
    ].join('\n')
  },{
    path:'entry.mjs',sourceType:'module',
    code:"import {leaf} from './leaf.mjs';console.log(leaf());"
  }];
  const selected=proveSourceObserverIslands(graph,['leaf.mjs']);
  assert.ok(selected.has('leaf.mjs'));
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const output=obfuscateFiles(graph,{
      mode,closedWorld:true,
      experimentalSourceObserverIslands:['leaf.mjs'],
      properties:true,identifiers:false,strings:false,
      seed:'agent5-windowproxy-static-tokens'
    }).files.find(file=>file.path==='leaf.mjs');
    assert.ok(output && output.metrics.properties>=1,mode+' must retain rename yield');
    assert.ok(!output.code.includes('record.top'),mode+' did not rename private read');
  }
});
