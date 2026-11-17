'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safePath,obfuscateFiles}=require('../src/core');
const {createScoHandler,createSnoLauncher}=require('../src');

const badPaths=[
  'module\uD800.js',
  'module\uDC00.js',
  'folder/half\uDFFF.mjs',
  'folder/\uDC00\uD800.js',
  'assets/\uD800\uD800.map'
];

test('Node UTF-8 encoding aliases a lone surrogate with a different filename',()=>{
  const lone='module\uD800.js';
  const replacement='module\uFFFD.js';
  assert.notEqual(lone,replacement);
  assert.deepEqual(Buffer.from(lone,'utf8'),Buffer.from(replacement,'utf8'));
  assert.notDeepEqual(Buffer.from('module\uD83D\uDE80.js','utf8'),Buffer.from(replacement,'utf8'));
});

test('path preflight rejects lossy surrogate filenames in COO, SNO and SCO',()=>{
  for(const candidate of badPaths){
    assert.throws(()=>safePath(candidate),/non-well-formed Unicode/,candidate);
    for(const mode of ['coo','sno','sco']){
      assert.throws(()=>obfuscateFiles([{
        path:candidate,code:'module.exports=1;',sourceType:'commonjs'
      }],{mode,seed:'utf8-alias-preflight'}),/non-well-formed Unicode/,
      mode+' '+candidate);
    }
    assert.throws(()=>createScoHandler([{
      path:candidate,code:'globalThis.ready=true;',sourceType:'script'
    }]),/non-well-formed Unicode/,'SCO handler '+candidate);
    assert.throws(()=>createSnoLauncher([{
      path:candidate,code:'module.exports=1;'
    }],candidate),/non-well-formed Unicode/,'SNO launcher '+candidate);
  }
});

test('well-formed astral characters and literal U+FFFD remain distinct valid paths',()=>{
  for(const candidate of ['folder/rocket\uD83D\uDE80.js','folder/replacement\uFFFD.js']){
    assert.equal(safePath(candidate),candidate);
    for(const mode of ['coo','sno','sco']){
      const result=obfuscateFiles([{
        path:candidate,code:'module.exports=7;',sourceType:'commonjs'
      }],{mode,seed:'utf8-alias-positive'});
      assert.equal(result.files[0].path,candidate);
    }
    assert.doesNotThrow(()=>createScoHandler([{
      path:candidate,code:'globalThis.ready=true;',sourceType:'script'
    }]));
    assert.match(createSnoLauncher([{
      path:candidate,code:'module.exports=7;'
    }],candidate),/Integrity check failed/);
  }
});
