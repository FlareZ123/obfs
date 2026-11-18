'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const watched={path:'watched.mjs',sourceType:'module',
  code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'};
/** @type {SourceFile} */
const independent={path:'independent.mjs',sourceType:'module',
  code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'};

/** @param {string} code @returns {SourceFile} */
function importer(code){
  return {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString());',
    code
  ].join('\n')};
}

/** @param {'coo'|'sno'|'sco'} mode @returns {import('../src/core').ObfuscationOptions} */
function options(mode){
  return {mode,closedWorld:true,
    seed:'source-island-host-argument-'+mode,
    strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']};
}

test('source islands refuse unreviewed exported host callbacks across all modes',()=>{
  const exports=[
    'export function inspect(reader){return reader("independent.mjs").includes("privateB")+unrelated();}',
    'export const inspect=(reader)=>reader("independent.mjs").includes("privateB")+unrelated();',
    'export default function inspect(reader){return reader("independent.mjs").includes("privateB")+unrelated();}',
    'export function inspect(source){return source(unrelated());}',
    'export const inspect=23;'
  ];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const exported of exports){
      assert.throws(()=>obfuscateFiles([watched,independent,importer(exported)],
        options(mode)),/Source observer islands refuse unreviewed host-callable exports/,
      mode+': '+exported);
    }
  }
});

test('source islands admit primitive snapshot exports while refusing callable-valued snapshots',()=>{
  /** @param {string} statement @returns {SourceFile} */
  const snapshotEntry=statement=>({path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    statement
  ].join('\n')});
  const snapshots=[
    'export const answer={source:watched.toString(),value:unrelated()};',
    'export const answer={source:watched.toString(),value:unrelated(),fixed:17};'
  ];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const statement of snapshots){
      const entry=snapshotEntry(statement);
      const result=obfuscateFiles([watched,independent,entry],options(mode));
      const selected=result.files.find(file=>file.path==='independent.mjs');
      assert.ok(selected&&selected.metrics.properties>=1,mode+': selected own key rewritten');
      assert.equal(result.files.find(file=>file.path==='entry.mjs')?.code,entry.code);
      assert.equal(result.files.find(file=>file.path==='watched.mjs')?.code,watched.code);
    }
    for(const expression of [
      'export const answer={callback:reader=>reader("independent.mjs")};',
      'export const answer={value:unknownReader("independent.mjs")};',
      'export const answer={value:{get callback(){return unrelated;}}};'
    ]){
      assert.throws(()=>obfuscateFiles([watched,independent,snapshotEntry(expression)],
        options(mode)),/Source observer islands refuse unreviewed host-callable exports/);
    }
  }
});

test('source islands preserve positive selected own-field rewrite with an unselected primitive leaf',()=>{
  const entry=importer('console.log(JSON.stringify({value:unrelated()}));');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const originals=[watched,independent,entry];
    const result=obfuscateFiles(originals,options(mode));
    const selected=result.files.find(file=>file.path==='independent.mjs');
    assert.ok(selected && selected.metrics.properties>=1,
      mode+': selected source must contain a protected own property');
    assert.equal(result.files.find(file=>file.path==='watched.mjs')?.code,watched.code);
    assert.equal(result.files.find(file=>file.path==='entry.mjs')?.code,entry.code);
  }
});
