'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile} */
const watched={path:'watched.mjs',sourceType:'module',
  code:'const a={publicField:17};const value=a.publicField;export function watched(){return value;}'};
/** @type {SourceFile} */
const leaf={path:'independent.mjs',sourceType:'module',
  code:'const b={privateB:23};const value=b.privateB;export function unrelated(){return value;}'};

/** @param {string} expression @returns {SourceFile} */
function importer(expression){
  return {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString());',
    expression,
    'console.log(unrelated());'
  ].join('\n')};
}

/**
 * Indirect ambient reflection is unsafe even when it hides Function and
 * filesystem methods in string fragments, and the named import itself
 * remains a direct zero-argument call. The first case reproduces the
 * behavior mismatch pinned by the adversarial two-platform workflow.
 */
test('source observer islands reject Reflect and Object constructor extraction',()=>{
  const indirectConstructor=[
    'const make=Reflect.get(()=>0,"con"+"structor");',
    'const load=make("return import(\\"node:fs/promises\\")");',
    'const read=Reflect.get(await load(),"re"+"adFile");',
    'const filename=make("return process.argv[1]")().replace(/entry\\.mjs$/,"independent.mjs");',
    'console.log((await read(filename,"utf8")).includes("privateB"));'
  ].join('\n');
  const descriptorConstructor=[
    'const proto=Object.getPrototypeOf(()=>0);',
    'const make=Object.getOwnPropertyDescriptor(proto,"con"+"structor").value;',
    'const load=make("return import(\\"node:fs/promises\\")");',
    'const read=Object.getOwnPropertyDescriptor(await load(),"re"+"adFile").value;',
    'const filename=make("return process.argv[1]")().replace(/entry\\.mjs$/,"independent.mjs");',
    'console.log((await read(filename,"utf8")).includes("privateB"));'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno'])){
    for(const expression of [indirectConstructor,descriptorConstructor]){
      assert.throws(()=>obfuscateFiles([watched,leaf,importer(expression)],{
        mode,closedWorld:true,strings:false,identifiers:false,
        experimentalSourceObserverIslands:['independent.mjs'],
        seed:'island-ambient-reflection'
      }),/Source observer island/,
      'Must reject runtime file-reader capabilities even without a literal loader');
    }
  }
});

test('source observer island still transforms safe JSON/console importer',()=>{
  const safe=importer('console.log(JSON.stringify({ok:true}));');
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const result=obfuscateFiles([watched,leaf,safe],{
      mode,closedWorld:true,strings:false,identifiers:false,
      experimentalSourceObserverIslands:['independent.mjs'],
      seed:'island-ambient-reflection-safe'
    });
    assert.ok((result.files.find(x=>x.path==='independent.mjs')?.metrics.properties??0)>0,
      'A proven primitive leaf must still gain a private-property rename');
    assert.equal(result.files.find(x=>x.path==='watched.mjs')?.code,watched.code);
  }
});
