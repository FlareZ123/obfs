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


test('reserved and Unicode filesystem document segments are URL-encoded before SRI lookup',()=>{
  const segments=[
    'hash#inside','percent%23inside','percent%','encodedslash%2F',
    'encoded-dot%2e%2e','double%2523','space inside','plus+inside',
    'semi;inside','amp&inside','braces{inside}','square[inside]',
    'quote\u0027inside','café','combining-e\u0301','emoji-🛡'
  ];
  const source='globalThis.reservedDocumentSRI="original bytes survive exotic document names";';
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    for(const extension of ['html','xhtml']){
      for(const segment of segments){
        const prefix='nested/'+segment+'/';
        const scriptPath=prefix+'client.js';
        const htmlPath=prefix+'index.'+extension;
        const original=[
          {path:scriptPath,sourceType:/** @type {const} */('script'),code:source},
          {path:htmlPath,sourceType:/** @type {const} */('asset'),
            code:page(source,'./client.js',extension==='xhtml')}
        ];
        const options={mode,seed:'sri-reserved/'+mode+'/'+extension+'/'+segment,
          strings:true,identifiers:false,properties:false};
        const protectedFiles=obfuscateFiles(original,options);
        assert.equal(protectedFiles.files[0].code,source,
          mode+' '+extension+': pinned script under '+JSON.stringify(segment));
        const control=[
          original[0],
          {...original[1],code:Buffer.from('<script src="./client.js"></script>')}
        ];
        const unpinned=obfuscateFiles(control,options);
        assert.notEqual(unpinned.files[0].code,source,
          mode+' '+extension+': positive no-SRI rewrite under '+JSON.stringify(segment));
      }
    }
  }
});


test('HTML and XHTML preserve SRI pins through encoded-slash dot-segment aliases',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    for(const extension of ['html','xhtml']) {
      const result=compile('public/client.js','public/index.'+extension,
        './folder%2F..%2Fclient.js',mode);
      assert.equal(result.emitted,result.source,
        extension+' '+mode+': decoded slash and dot segments must match the pinned file');
    }
  }
});

test('unrelated encoded-slash dot-segment SRI paths retain positive transformation yield',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    const result=compile('public/client.js','public/index.html',
      './folder%2F..%2Fother.js',mode);
    assert.notEqual(result.emitted,result.source,
      mode+': unrelated decoded path must not suppress transformation');
  }
});
