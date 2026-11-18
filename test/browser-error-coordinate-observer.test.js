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


test('browser error-coordinate aliases decline local property rewrites',()=>{
  for(const specimen of specimens){
    const source=specimen.source.replace(
      'null.value;',
      'const owner={distinctivelyLongPrivateField:73};'+
        'const value=owner.distinctivelyLongPrivateField;null.value;'
    );
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'script',code:source
    }],{
      mode:'coo',seed:'browser-error-coordinate-local-'+specimen.name,
      strings:false,identifiers:false,properties:true
    }).files[0];
    assert.equal(output.code,source,specimen.name);
    assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0},
      specimen.name);
  }

  const safe='const owner={distinctivelyLongPrivateField:73};'+
    'globalThis.answer=owner.distinctivelyLongPrivateField;';
  const output=obfuscateFiles([{
    path:'safe-listener.js',sourceType:'script',code:safe
  }],{
    mode:'coo',seed:'browser-error-coordinate-safe-listener',
    strings:false,identifiers:false,properties:true
  }).files[0];
  assert.ok(output.metrics.properties>0,output.code);
});
