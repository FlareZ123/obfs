'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles,createScoHandler,createSnoLauncher}=require('../src');

/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];
const isolated=String.fromCharCode(0xd800);
const original='module.exports="'+isolated+'";';

test('Node UTF-8 publication substitutes a raw unpaired source surrogate',()=>{
  const native=new Function('module',original+'return module.exports;')({exports:null});
  const written=Buffer.from(original,'utf8').toString('utf8');
  const published=new Function('module',written+'return module.exports;')({exports:null});
  assert.equal(native.charCodeAt(0),0xd800);
  assert.equal(published.charCodeAt(0),0xfffd);
  assert.notEqual(native,published);
});

test('three compiler modes refuse non-well-formed raw JavaScript source strings',()=>{
  for(const mode of modes){
    assert.throws(()=>obfuscateFiles([
      {path:'entry.cjs',code:original,sourceType:'commonjs'}
    ],{mode,seed:'unpaired-source-input'}),/JavaScript source contains unpaired surrogate/,mode);
  }
});

test('direct SCO handler also refuses raw unpaired source before any HTTP route',()=>{
  assert.throws(()=>createScoHandler([
    {path:'entry.js',code:'globalThis.result="'+isolated+'";',sourceType:'script'}
  ]),/JavaScript source contains unpaired surrogate/);
});

test('direct SNO launcher refuses malformed executable entry text and bytes',()=>{
  assert.throws(()=>createSnoLauncher([{
    path:'entry.cjs',code:original
  }],'entry.cjs'),/JavaScript source contains unpaired surrogate/);
  assert.throws(()=>createSnoLauncher([{
    path:'entry.cjs',code:Buffer.from([0xff,0xfe,0x00])
  }],'entry.cjs'),/Invalid UTF-8 JavaScript source: entry\.cjs/);
});

test('explicit escape spelling and valid astral pairs remain eligible',()=>{
  for(const source of ['module.exports="\\ud800";','module.exports="🚀";']){
    for(const mode of modes){
      const compiled=obfuscateFiles([
        {path:'entry.cjs',code:source,sourceType:'commonjs'}
      ],{mode,seed:'wellformed-source-positive',strings:false,identifiers:false,properties:false});
      assert.equal(compiled.files.length,1);
      const emitted=compiled.files[0].code;
      assert.equal(typeof emitted,'string');
      const originalValue=new Function('module',source+'return module.exports;')({exports:null});
      const generatedValue=new Function('module',emitted+'return module.exports;')({exports:null});
      assert.equal(generatedValue,originalValue);
      assert.equal(/[\uD800-\uDFFF]/u.test(emitted),false);
    }
  }
});
