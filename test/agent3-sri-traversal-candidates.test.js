'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/**
 * @param {string} source
 * @param {string} requestPath
 * @returns {Buffer}
 */
function page(source,requestPath){
  const hash=createHash('sha256').update(source).digest('base64');
  return Buffer.from('<!doctype html><html><head><script src="'+requestPath+
    '" integrity="sha256-'+hash+'"></script></head><body></body></html>');
}

/**
 * @param {string} requestPath
 * @param {Mode} mode
 * @returns {{source:string,emitted:string}}
 */
function compile(requestPath,mode){
  const source='globalThis.traversalSRI="must-not-be-pinned-through-root-escape";';
  const result=obfuscateFiles([
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'public/index.html',sourceType:/** @type {const} */('asset'),
      code:page(source,requestPath)}
  ],{mode,seed:'sri-traversal-'+mode+'-'+requestPath,
    strings:true,identifiers:false,properties:false,closedWorld:true});
  return {source,emitted:/** @type {string} */(result.files[0].code)};
}

test('encoded POSIX separators that traverse above publication root do not alias a root script',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const result=compile('./folder%2F..%2F..%2F..%2Fclient.js',mode);
    assert.notEqual(result.emitted,result.source,
      mode+': path escaping above publication root must not pin root client.js');
  }
});

test('encoded Win32 separators that traverse above publication root do not alias a root script',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const result=compile('./folder%5C..%5C..%5C..%5Cclient.js',mode);
    assert.notEqual(result.emitted,result.source,
      mode+': Win32 path escaping above publication root must not pin root client.js');
  }
});
