'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {hasCssDataImport}=require('../src/css-data-imports');
const {obfuscateFiles,createScoHandler}=require('../src');

// Exhaustive, deterministic Cartesian grammar matrix. Every generated
// positive is a stylesheet at-rule; the paired negative places the exact
// same at-keyword tokens in a custom-property declaration value.
const keywords=["@import","@IMPORT","@\\69mport","@im\\70ort","@i\\6d port"];
const urls=["'data:text/css,canary'","\"data:text/css,canary\"","url(\"data:text/css,canary\")","url(data:text/css,canary)","url(\"d\\61 ta:text/css,canary\")","url(\"da\\9 ta:text/css,canary\")"];
const gaps=[" "," /**/ ","\t","\n"];

test('120 real escaped CSS imports are refused and 120 inert declaration values are preserved',()=>{
  let active=0,inert=0;
  for(const keyword of keywords){
    for(const gap of gaps){
      for(const url of urls){
        const importRule=keyword+gap+url+';';
        const inertRule='.widget{--payload: '+importRule+' color:rgb(4,5,6)}';
        assert.equal(hasCssDataImport(importRule),true,'Active: '+importRule);
        active++;
        assert.equal(hasCssDataImport(inertRule),false,'Inert: '+inertRule);
        inert++;
      }
    }
  }
  assert.equal(active,keywords.length*gaps.length*urls.length);
  assert.equal(inert,keywords.length*gaps.length*urls.length);
});

test('selected representative grammar matrix cases preserve asset bytes in all three modes',()=>{
  const entry={path:'entry.mjs',sourceType:/** @type {const} */ ('module'),code:'export const status=9;'};
  const selected=[
    keywords[0]+gaps[0]+urls[0]+';',
    keywords[1]+gaps[1]+urls[2]+';',
    keywords[2]+gaps[2]+urls[4]+';',
    keywords[3]+gaps[3]+urls[5]+';',
    keywords[4]+gaps[0]+urls[3]+';'
  ];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const rule of selected){
      const active={path:'style.css',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(rule)};
      assert.throws(()=>obfuscateFiles([entry,active],{mode}),/CSS data import/u);
      const inertCss='.widget{--payload: '+rule+' color:rgb(4,5,6)}';
      const inert={path:'style.css',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(inertCss)};
      const compiled=obfuscateFiles([entry,inert],{mode});
      assert.deepEqual(compiled.files.find(f=>f.path==='style.css')?.code,inert.code);
    }
  }
  for(const rule of selected){
    assert.throws(()=>createScoHandler([
      {path:'style.css',sourceType:'asset',code:Buffer.from(rule)}
    ]),/CSS data import/u);
    const harmless='.widget{--payload: '+rule+' color:rgb(4,5,6)}';
    assert.equal(typeof createScoHandler([
      {path:'style.css',sourceType:'asset',code:Buffer.from(harmless)}
    ]),'function');
  }
});
