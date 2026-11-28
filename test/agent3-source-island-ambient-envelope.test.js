'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const leaves=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={originalKey:17};const v=a.originalKey;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'}
];

/** @param {string} body @returns {SourceFile[]} */
function graph(body) {
  return [...leaves,{path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    body
  ].join('\n')}];
}

/** @param {'coo'|'sco'|'sno'} mode @returns {import('../src/core').ObfuscationOptions} */
function options(mode) {
  return {mode,seed:'agent3-source-island-ambient-envelope-'+mode,
    properties:true,identifiers:true,strings:false,closedWorld:true,
    experimentalSourceObserverIslands:['independent.mjs']};
}

test('unproved ambient globals, scoped-shadow decoys and console value escapes refuse in all modes',()=>{
  const unsafe=[
    ['unlisted host file reader',
      'const fd=ambientFilesystem.openSync("./independent.mjs","r");console.log(fd);'],
    ['unlisted computed host accessor',
      'console.log(bridge["read"+ "Module"]("./independent.mjs"));'],
    ['indirect capability from call',
      'const source=hostLookup("./independent.mjs");console.log(source);'],
    ['destructured host access',
      'const {read:readSource}=hostBridge;console.log(readSource("./independent.mjs"));'],
    ['nested parameter is not a module binding',
      'function distractor(ambientFilesystem){return 0;}console.log(ambientFilesystem.openSync("./independent.mjs","r"));'],
    ['nested local is not a module binding',
      'function distractor(){const ambientFilesystem=0;return 0;}console.log(ambientFilesystem.openSync("./independent.mjs","r"));'],
    ['console return value is not a trusted sink',
      'const result=console.log("source");console.log(result);'],
    ['console method alias escapes its sink position',
      'const log=console.log;log(unrelated());'],
    ['JSON method alias escapes its pure direct-call form',
      'const convert=JSON.stringify;console.log(convert({n:unrelated()}));']
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    for(const [name,statement] of unsafe)
      assert.throws(()=>obfuscateFiles(graph(statement),options(mode)),
        /Source observer island/i,mode+': '+name);
  }
});

test('direct output-only console and primitive snapshot remain positive',()=>{
  const allowed=[
    'console.log(JSON.stringify({source:watched.toString(),n:unrelated()}));',
    'export const answer={source:watched.toString(),n:unrelated()};'
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    for(const statement of allowed){
      const result=obfuscateFiles(graph(statement),options(mode));
      const selected=result.files.find(file=>file.path==='independent.mjs');
      assert.ok(selected && selected.metrics.properties>=1,mode+' / '+statement);
      assert.equal(selected.metrics.bindings,0);
      assert.equal(result.files.find(file=>file.path==='entry.mjs')?.code,graph(statement)[2].code);
    }
  }
});
