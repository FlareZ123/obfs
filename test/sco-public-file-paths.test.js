'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScoHandler}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

test('programmatic SCO rejects unsafe public file paths at handler construction',()=>{
  const invalid=[
    '../private.mjs',
    '/absolute.js',
    'dir/../hidden.js',
    'folder\\client.js',
    'CON.js',
    'dir/NUL.txt',
    'space name .js',
    'file?.js'
  ];
  for(const name of invalid) {
    assert.throws(()=>createScoHandler([
      {path:name,sourceType:'script',code:'globalThis.ready=true;'}
    ]),/Unsafe|noncanonical|Windows/i,name);
  }
});

test('programmatic SCO prevents duplicate and case-colliding publication routes',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'public/app.js',sourceType:'script',code:'globalThis.ready=1;'},
    {path:'public/APP.js',sourceType:'script',code:'globalThis.ready=2;'}
  ];
  assert.throws(()=>createScoHandler(files),/Duplicate file|collision/i);
  files[1].path='public/app.js';
  assert.throws(()=>createScoHandler(files),/Duplicate file|collision/i);
});

test('programmatic SCO admits valid named JS and binary assets',()=>{
  assert.doesNotThrow(()=>createScoHandler([
    {path:'module.mjs',sourceType:'module',code:'export const safe=true;'},
    {path:'assets/image.png',sourceType:'asset',code:Buffer.from([0,1,2])}
  ]));
});
