'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src/core');
const {parse,observesDistributedSource}=require('../src/ast');
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


for(const root of ['top','parent','opener']) {
  test('default graph source observer flags browser WindowProxy root '+root,()=>{
    const files=graph(root);
    const entry=files[1];
    assert.equal(observesDistributedSource(parse(String(entry.code),'module')),true,
      'WindowProxy provides an ambient DOM source-observation capability');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const output=obfuscateFiles(files,{
        mode,seed:'agent5-sri-default-'+root,
        closedWorld:true,strings:false,identifiers:false
      });
      const emitted=output.files.find(file=>file.path==='leaf.mjs');
      assert.equal(emitted?.metrics.properties,0,
        mode+': must preserve selected module bytes under browser WindowProxy access');
    }
  });
}

test('default graph conservatively recognizes active Document HTML parser SRI',()=>{
  const files=graph('top').map(file=>file.path==='entry.mjs'?{
    ...file,code:String(file.code).replace("const host=top;\nconst doc=host['document'];","const doc=document;")
  }:file);
  const entry=files[1];
  assert.equal(observesDistributedSource(parse(String(entry.code),'module')),true);
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'agent5-sri-document-parser',
    closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(output.files.find(file=>file.path==='leaf.mjs')?.metrics.properties,0);
});

test('proven benign active Document insertAdjacentHTML retains default rewrite yield',()=>{
  const files=[
    leaf,
    {path:'entry.mjs',sourceType:'module',code:[
      "import {leaf} from './leaf.mjs';",
      'void leaf();',
      "document.body.insertAdjacentHTML('beforeend','<p>hello</p>');"
    ].join('\n')}
  ];
  const entry=files[1];
  assert.equal(observesDistributedSource(parse(String(entry.code),'module')),false);
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'agent5-benign-html-parser',
    closedWorld:true,strings:false,identifiers:false
  });
  assert.ok((output.files.find(file=>file.path==='leaf.mjs')?.metrics.properties??0)>=1,
    'non-integrity static HTML must not suppress unrelated private property rewrites');
});
