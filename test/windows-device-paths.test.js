'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {safePath,obfuscateFiles} = require('../src/core');

test('Windows reserved device names include ISO-8859-1 superscript digits',()=>{
  for (const candidate of [
    'COM¹','COM²','COM³','com¹.txt','Com².data',
    'LPT¹','LPT²','LPT³','lpt³.js',
    'nested/COM¹/file.js','nested/LPT².log',
    'CON.txt','AUX/file.js'
  ]) {
    assert.throws(()=>safePath(candidate),/Unsafe Windows filename segment/,candidate);
    assert.throws(()=>obfuscateFiles([
      {path:candidate,code:'module.exports=1;',sourceType:'commonjs'}
    ],{mode:'sno',seed:'reserved-paths'}),/Unsafe Windows filename segment/,candidate);
  }
  for (const candidate of [
    'com10.js','COM⁴.txt','lpt10.js','comic.js','auxiliary/file.js'
  ]) {
    assert.equal(safePath(candidate),candidate);
  }
});
