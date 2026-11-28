'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const graph=[
  {path:'watched.mjs',sourceType:'module',code:
    'const a={publicField:17};const v=a.publicField;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',code:
    'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString(),unrelated());'
  ].join('\n')}
];

for(const mode of /** @type {const} */(['coo','sco','sno'])) {
  test('source island '+mode+' allows only selected local property substitution',()=>{
    const result=obfuscateFiles(graph,{
      mode,closedWorld:true,seed:'island-property-only-'+mode,
      properties:true,identifiers:true,strings:true,
      experimentalSourceObserverIslands:['independent.mjs']
    });
    const selected=result.files.find(f=>f.path==='independent.mjs');
    assert.ok(selected,'selected file emitted');
    assert.ok(selected.metrics.properties>0,'selected own-record key genuinely changed');
    assert.equal(selected.metrics.bindings,0,'island does not opt into binding renaming');
    assert.equal(selected.metrics.literals,0,'island does not opt into string decoder');
    assert.equal(result.crossFile.properties,0,'cross-file source observer veto remains');
    for(const original of graph.filter(f=>f.path!=='independent.mjs')) {
      assert.equal(result.files.find(f=>f.path===original.path)?.code,original.code,
        'unselected producer and observer must remain source-identical');
    }
  });

  test('source island '+mode+' does not implicitly enable selected register VM',()=>{
    assert.throws(()=>obfuscateFiles(graph,{
      mode,closedWorld:true,seed:'island-vm-refusal-'+mode,
      strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs'],
      experimentalRegisterVm:{'independent.mjs':['unrelated']}
    }),/Register VM requires .*source observation/,
      'Only local own-property renaming is permitted by island exception');
  });
}
