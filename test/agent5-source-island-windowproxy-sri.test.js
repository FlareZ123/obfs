'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src/core');
const {proveSourceObserverIslands}=require('../src/source-observer-islands');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const leaf={
  path:'leaf.mjs',sourceType:'module',
  code:'const record={privateField:23};const value=record.privateField;export function leaf(){return value;}'
};

/** @param {string} root @returns {SourceFile[]} */
function graph(root) {
  const digest=createHash('sha256').update(leaf.code).digest('base64');
  const integrity='sha256-'+digest;
  const markup='<link id="sri-probe" rel="modulepreload" href="./leaf.mjs?integrity=1" integrity="'+integrity+'">';
  return [leaf,{
    path:'entry.mjs',sourceType:'module',
    code:[
      "import {leaf} from './leaf.mjs';",
      'void leaf();',
      'const host='+root+';',
      "const doc=host['document'];",
      'doc.head.insertAdjacentHTML("beforeend",'+JSON.stringify(markup)+');'
    ].join('\n')
  }];
}

for(const root of ['top','parent','opener']) {
  test('source island declines browser WindowProxy root '+root+' with an in-graph SRI probe',()=>{
    // This is a syntactically valid browser ESM graph. Every browser global
    // below can expose the top-level Document through the WindowProxy.
    // The inserted modulepreload integrity pin observes distributed leaf
    // bytes, even though the selected function is used only as leaf().
    assert.throws(()=>proveSourceObserverIslands(graph(root),['leaf.mjs']),
      /source|loader|opaque|island|global/i);
  });
}

test('independent primitive island still performs a real local property rewrite',()=>{
  /** @type {SourceFile[]} */
  const files=[leaf,{
    path:'entry.mjs',sourceType:'module',
    code:"import {leaf} from './leaf.mjs';console.log(leaf());"
  }];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const result=obfuscateFiles(files,{
      mode,seed:'agent5-top-dom-sri-positive',closedWorld:true,
      strings:false,identifiers:false,
      experimentalSourceObserverIslands:['leaf.mjs']
    });
    const emitted=result.files.find(file=>file.path==='leaf.mjs');
    assert.ok(emitted && typeof emitted.code==='string',mode);
    assert.ok(emitted.metrics.properties>=1,mode+': no actual rewrite yield');
    assert.ok(!emitted.code.includes('privateField'),mode+': original field remains');
  }
});
