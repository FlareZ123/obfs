'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');

/**
 * @param {string} path
 * @param {string} code
 * @returns {import('../src/core').SourceFile}
 */
function moduleFile(path,code) {
  return {path,sourceType:'module',code};
}

const options={
  closedWorld:true,
  strings:false,
  properties:true,
  identifiers:true,
  experimentalSourceObserverIslands:['watched.mjs']
};

test('selected exported primitive reader rejects an unknown host callback in its body',()=>{
  const files=[
    moduleFile('watched.mjs',
      'const value=17;export function watched(){getExternal();return value;}'),
    moduleFile('entry.mjs',
      'import {watched} from "./watched.mjs";console.log(watched.toString());')
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(
      ()=>obfuscateFiles(files,{...options,mode}),
      /not a pure primitive ESM leaf/u
    );
  }
});

test('importer rejects passing an isolated callable to an unknown host callback',()=>{
  const files=[
    moduleFile('watched.mjs',
      'const record={privateField:17};const value=record.privateField;export function watched(){return value;}'),
    moduleFile('entry.mjs',
      'import {watched} from "./watched.mjs";getExternal(watched);console.log(watched.toString());')
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(
      ()=>obfuscateFiles(files,{...options,mode}),
      /function escapes direct zero-argument calls/u
    );
  }
});
