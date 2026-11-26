'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/**
 * Build an HTML/XHTML page with a valid SHA-256 integrity pin for the source.
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
      '</head><body><p>encoded separator SRI</p></body></html>':
    '<!doctype html><html><head>'+script+
      '</head><body><p>encoded separator SRI</p></body></html>');
}

/**
 * Compile a script and its SRI-bearing HTML/XHTML document.
 * @param {string} requestPath
 * @param {string} documentPath
 * @param {Mode} mode
 * @returns {{source:string,emitted:string}}
 */
function compile(requestPath,documentPath,mode) {
  const source='globalThis.encodedSeparatorSri="original-public-source-canary";';
  const result=obfuscateFiles([
    {path:'public/client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:documentPath,sourceType:/** @type {const} */('asset'),
      code:page(source,requestPath,/\.xhtml$/u.test(documentPath))}
  ],{
    mode,
    seed:'agent3-postdecode-sri-'+mode+'-'+requestPath+'-'+documentPath,
    strings:true,
    identifiers:false,
    properties:false,
    closedWorld:true
  });
  return {source,emitted:String(result.files[0].code)};
}

const modes=/** @type {Mode[]} */(['coo','sno','sco']);
const encodedAliases=[
  {
    name:'encoded-posix-separators',
    request:'./folder%2F..%2Fclient.js',
    normalized:path.posix.normalize('public/folder/../client.js')
  },
  {
    name:'encoded-posix-separators-lowercase',
    request:'./folder%2f..%2fclient.js',
    normalized:path.posix.normalize('public/folder/../client.js')
  },
  {
    name:'encoded-win32-separators',
    request:'./folder%5C..%5Cclient.js',
    normalized:path.win32.normalize('public\\folder\\..\\client.js').replace(/\\/gu,'/')
  }
];

test('server-side decode then POSIX/Win32 normalization can resolve encoded separators to the pinned script',()=>{
  for(const alias of encodedAliases) {
    assert.equal(alias.normalized,'public/client.js',alias.name);
  }
});

for(const mode of modes) {
  for(const extension of ['html','xhtml']) {
    for(const alias of encodedAliases) {
      test('HTML and XHTML preserve SRI-pinned scripts: '+extension+' '+mode+' '+alias.name,()=>{
        const result=compile(alias.request,'public/index.'+extension,mode);
        assert.equal(result.emitted,result.source,
          extension+' '+mode+': '+alias.name+' '+alias.request);
      });
    }
  }
}

test('an encoded separator path resolving to a different script keeps positive rewrite yield',()=>{
  for(const mode of modes) {
    const result=compile('./folder%2Fother%2Fclient.js','public/index.html',mode);
    assert.notEqual(result.emitted,result.source,mode+': unrelated decoded path');
  }
});

test('literal URL dot-segment resolution remains a pinned control',()=>{
  for(const mode of modes) {
    const result=compile('./folder/../client.js','public/index.html',mode);
    assert.equal(result.emitted,result.source,mode+': literal dot segments');
  }
});
