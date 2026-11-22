'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/**
 * A static server may canonicalize URL spellings to the same published file,
 * including case and NFC equivalences. Input tree inventory already refuses
 * these collisions, so SRI matching should use its same portable identities.
 * @param {string} source
 * @param {string} requestPath
 * @param {boolean} xml
 * @returns {Buffer}
 */
function page(source,requestPath,xml) {
  const hash=createHash('sha256').update(source).digest('base64');
  const script='<script src="'+requestPath+'" integrity="sha256-'+hash+'"></script>';
  return Buffer.from(xml?
    '<?xml version="1.0" encoding="UTF-8"?>'+
      '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+script+
      '</head><body><p>portable SRI</p></body></html>':
    '<!doctype html><html><head>'+script+
      '</head><body><p>portable SRI</p></body></html>');
}

/**
 * @param {string} scriptPath
 * @param {string} documentPath
 * @param {string} requestPath
 * @param {Mode} mode
 * @returns {{source:string,emitted:string}}
 */
function compile(scriptPath,documentPath,requestPath,mode) {
  const source='globalThis.portableSri="unchanged-public-source-canary-value";';
  const result=obfuscateFiles([
    {path:scriptPath,sourceType:/** @type {const} */('script'),code:source},
    {path:documentPath,sourceType:/** @type {const} */('asset'),
      code:page(source,requestPath,/\.xhtml$/u.test(documentPath))}
  ],{mode,seed:'portable-sri-'+scriptPath+'-'+mode,
    strings:true,identifiers:false,properties:false,closedWorld:true});
  return {source,emitted:/** @type {string} */(result.files[0].code)};
}

test('HTML and XHTML preserve SRI-pinned scripts under case-only URI aliases',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    for(const extension of ['html','xhtml']) {
      const result=compile('public/client.js','public/index.'+extension,'./CLIENT.JS',mode);
      assert.equal(result.emitted,result.source,extension+' '+mode+': portable case alias');
    }
  }
});

test('HTML and XHTML preserve SRI-pinned scripts under NFC/NFD URI aliases',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    for(const extension of ['html','xhtml']) {
      const result=compile('public/caf\u00e9.js','public/index.'+extension,
        './cafe\u0301.js',mode);
      assert.equal(result.emitted,result.source,extension+' '+mode+': portable Unicode alias');
    }
  }
});

test('provably unrelated SRI paths do not suppress positive source transformation',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    for(const extension of ['html','xhtml']) {
      const result=compile('public/client.js','public/index.'+extension,'./OTHER.JS',mode);
      assert.notEqual(result.emitted,result.source,
        extension+' '+mode+': unrelated SRI must keep transformation yield');
    }
  }
});

test('HTML and XHTML SRI pin through possible Win32 trailing-dot and space aliases',()=>{
  const aliases=[
    {source:'public/client.js',url:'./client.js.'},
    {source:'public/client.js',url:'./client.js%20'},
    {source:'public/docs/client.js',url:'./docs./client.js'}
  ];
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    for(const extension of ['html','xhtml']){
      for(const alias of aliases){
        const result=compile(alias.source,'public/index.'+extension,alias.url,mode);
        assert.equal(result.emitted,result.source,
          extension+' '+mode+': potential Win32 path alias '+alias.url);
      }
    }
  }
});

test('nonmatching trailing-dot and space URLs preserve positive transformation yield',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const result=compile('public/client.js','public/index.html','./other.js.',mode);
    assert.notEqual(result.emitted,result.source,
      mode+': unrelated trailing-dot SRI must not disable source transforms');
  }
});
