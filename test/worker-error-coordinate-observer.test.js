'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {parentSource,workerSource}=require('../sims/worker-error-coordinate-attack');

test('cross-file Worker error observers decline host-lock prefixes',()=>{
  assert.throws(
    ()=>obfuscateFiles([
      {path:'parent.js',sourceType:'script',code:parentSource},
      {path:'worker.js',sourceType:'script',code:workerSource}
    ],{
      mode:'coo',seed:'worker-error-coordinate-test',
      strings:false,properties:false,identifiers:false,
      allowedHosts:['example.com']
    }),
    /Host locking cannot preserve observable source/u
  );

  const safe=obfuscateFiles([
    {path:'a.js',sourceType:'script',code:'globalThis.a=1;'},
    {path:'b.js',sourceType:'script',code:'globalThis.b=2;'}
  ],{
    mode:'coo',seed:'worker-error-coordinate-safe',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['example.com']
  });
  assert.equal(safe.files.length,2);
  for(const file of safe.files)
    assert.match(/** @type {string} */(file.code),/Unauthorized execution host/u);
});
