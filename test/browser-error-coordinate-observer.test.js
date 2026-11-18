'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {specimens}=require('../sims/browser-error-coordinate-attack');

test('browser runtime error-coordinate observers decline host-lock prefixes',()=>{
  for(const specimen of specimens){
    assert.throws(
      ()=>obfuscateFiles([{
        path:'entry.js',sourceType:'script',code:specimen.source
      }],{
        mode:'coo',seed:'browser-error-coordinate-'+specimen.name,
        strings:false,properties:false,identifiers:false,
        allowedHosts:['example.com']
      }),
      /Host locking cannot preserve observable source/u,
      specimen.name
    );
  }

  const safe='globalThis.result=42;';
  const emitted=obfuscateFiles([{
    path:'safe.js',sourceType:'script',code:safe
  }],{
    mode:'coo',seed:'browser-error-coordinate-safe',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['example.com']
  }).files[0];
  assert.match(/** @type {string} */(emitted.code),/Unauthorized execution host/u);
});
