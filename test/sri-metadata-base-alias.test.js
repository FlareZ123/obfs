'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {hasPinnedLocalJavaScriptIntegrity}=require('../src/html-assets');

/** @typedef {'coo'|'sco'|'sno'} Mode */
const original='globalThis.sriGrammarProof="this original payload is SRI protected despite external aliases";';

/**
 * HTML/XHTML external scripts may be mounted by the publisher under a
 * filename-disjoint URL. An explicit <base href> can make a relative script
 * address resolve to the same unknown public route. Valid SRI algorithm
 * labels are ASCII case-insensitive by W3C SRI section 2.
 * @param {'html'|'xhtml'} type
 * @param {string} metadata
 * @param {boolean} baseMounted
 * @returns {{path:string,sourceType:'script'|'asset',code:string|Buffer}[]}
 */
function graph(type,metadata,baseMounted){
  const url=baseMounted?'renamed-browser-entry.js':'/app/v3/renamed-browser-entry.js';
  const base=baseMounted?'<base href="/app/v3/"/>':'';
  const html='<html><head>'+base+
    '<script src="'+url+'" integrity="'+metadata+'"></script></head></html>';
  const xbase=baseMounted?'<h:base href="/app/v3/"/>':'';
  const xhtml='<?xml version="1.0" encoding="UTF-8"?>'+
    '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+xbase+
    '<h:script src="'+url+'" integrity="'+metadata+'"></h:script>'+
    '</h:head></h:html>';
  return [
    {path:'client.js',sourceType:'script',code:original},
    {path:'index.'+type,sourceType:'asset',code:Buffer.from(type==='html'?html:xhtml)}
  ];
}

/**
 * @param {ReturnType<typeof graph>} files
 * @param {Mode} mode
 * @returns {string}
 */
function compile(files,mode){
  return /** @type {string} */(obfuscateFiles(files,{
    mode,seed:'sri-grammar-base/'+mode,
    strings:true,properties:false,identifiers:false
  }).files[0].code);
}

test('ASCII uppercase SHA-256 metadata pins original source at unknown root aliases',()=>{
  const digest=createHash('sha256').update(original).digest('base64');
  for(const type of /** @type {const} */(['html','xhtml'])){
    const files=graph(type,'SHA256-'+digest,false);
    assert.equal(hasPinnedLocalJavaScriptIntegrity(files),true,
      type+': uppercase SRI hash algorithm must match original JS');
    for(const mode of /** @type {Mode[]} */(['coo','sco','sno']))
      assert.equal(compile(files,mode),original,type+' '+mode);
  }
});

test('explicit absolute document base preserves a relative JS alias with SRI',()=>{
  const digest=createHash('sha384').update(original).digest('base64');
  for(const type of /** @type {const} */(['html','xhtml'])){
    const files=graph(type,'sha384-'+digest,true);
    assert.equal(hasPinnedLocalJavaScriptIntegrity(files),true,
      type+': browser base turns a relative script src into an unknown absolute mount');
    for(const mode of /** @type {Mode[]} */(['coo','sco','sno']))
      assert.equal(compile(files,mode),original,type+' '+mode);
  }
});

test('unrelated digests and known independent relative URLs retain rewrite yield',()=>{
  const digest=createHash('sha256').update('truly unrelated external JavaScript').digest('base64');
  for(const type of /** @type {const} */(['html','xhtml'])){
    for(const mounted of [true,false]){
      const files=graph(type,'SHA256-'+digest,mounted);
      assert.equal(hasPinnedLocalJavaScriptIntegrity(files),false,
        type+': unrelated digest must not imply a source-byte commitment');
      for(const mode of /** @type {Mode[]} */(['coo','sco','sno']))
        assert.notEqual(compile(files,mode),original,type+' '+mode);
    }
  }
});
