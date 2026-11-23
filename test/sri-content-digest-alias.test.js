'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {hasPinnedLocalJavaScriptIntegrity}=require('../src/html-assets');

/** @typedef {'coo'|'sco'|'sno'} Mode */
const source='globalThis.sriMountAlias="same JavaScript bytes under an unknown deployment URL";';

/**
 * Model a publisher mounting client.js under an independently configured URL
 * whose path shares no suffix with the supplied source filename. The original
 * HTML carries a genuine cryptographic commitment to the served JS bytes.
 * @param {'html'|'xhtml'} type
 * @param {string} algorithm
 * @param {string} pinnedSource
 * @returns {{path:string,sourceType:'script'|'asset',code:string|Buffer}[]}
 */
function graph(type,algorithm,pinnedSource){
  const digest=createHash(algorithm).update(pinnedSource).digest('base64');
  const url='/app/v3/renamed-public-entry.js';
  const tag=type==='html'?
    '<script src="'+url+'" integrity="'+algorithm+'-'+digest+'"></script>':
    '<h:script src="'+url+'" integrity="'+algorithm+'-'+digest+'"></h:script>';
  const markup=type==='html'?
    '<!doctype html><html><head>'+tag+'</head></html>':
    '<?xml version="1.0" encoding="UTF-8"?>'+
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+tag+
      '</h:head></h:html>';
  return [
    {path:'client.js',sourceType:'script',code:source},
    {path:'index.'+type,sourceType:'asset',code:Buffer.from(markup)}
  ];
}

/**
 * @param {ReturnType<typeof graph>} files
 * @param {Mode} mode
 * @returns {string}
 */
function compile(files,mode){
  const output=obfuscateFiles(files,{
    mode,seed:'sri-content-digest-mount-'+mode,
    strings:true,identifiers:false,properties:false
  });
  return /** @type {string} */(output.files[0].code);
}

test('SRI content digest pins declared JavaScript across unknown URL mounts',()=>{
  for(const type of /** @type {const} */(['html','xhtml'])){
    for(const algorithm of ['sha256','sha384','sha512']){
      const files=graph(type,algorithm,source);
      assert.equal(hasPinnedLocalJavaScriptIntegrity(files),true,
        type+' '+algorithm+': matching digest should identify a file despite an unproved route');
      for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
        assert.equal(compile(files,mode),source,
          type+' '+algorithm+' '+mode+': SRI commits the original published response bytes');
      }
    }
  }
});

test('unrelated SRI digest on an unrelated URL preserves positive rewrite yield',()=>{
  for(const type of /** @type {const} */(['html','xhtml'])){
    for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
      const files=graph(type,'sha384','different external script bytes');
      assert.equal(hasPinnedLocalJavaScriptIntegrity(files),false);
      assert.notEqual(compile(files,mode),source,
        type+' '+mode+': unrelated integrity must not veto the local transform');
    }
  }
});
