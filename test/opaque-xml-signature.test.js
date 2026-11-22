'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/** @param {string} body @returns {Buffer} */
function xml(body){
  return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>'+
    '<root xmlns:h="http://www.w3.org/1999/xhtml" '+
    'xmlns:s="http://www.w3.org/2000/svg">'+body+'</root>');
}

/** @param {Buffer} asset @param {Mode} mode */
function compile(asset,mode){
  const original='globalThis.opaqueMimeCanary="a-plain-unique-string";';
  const compiled=obfuscateFiles([
    {path:'client.js',sourceType:/** @type {const} */('script'),code:original},
    {path:'document.blob',sourceType:/** @type {const} */('asset'),code:asset}
  ],{mode,seed:'opaque-xml-prolog-'+mode,closedWorld:true,
    strings:true,identifiers:false,properties:false});
  return {original,compiled};
}

test('XML declaration in opaque extension refuses executable XML and HTML markup',()=>{
  const samples=[
    xml('<h:script><![CDATA[globalThis.inline=1;]]></h:script>'),
    xml('<h:button onclick="globalThis.inline=2">press</h:button>'),
    xml('<s:svg><s:script>globalThis.inline=3;</s:script></s:svg>'),
    xml('<script>globalThis.inline=4;</script>')
  ];
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    for(const sample of samples){
      assert.throws(()=>compile(sample,mode),/HTML asset contains/,
        mode+': executable XML-prolog document under arbitrary suffix');
      assert.throws(()=>createScoHandler([
        {path:'document.blob',sourceType:/** @type {const} */('asset'),code:sample}
      ]),/HTML asset contains/,
      'Trusted SCO server must reject opaque executable XML declaration');
    }
  }
});

test('XML declaration in opaque extension preserves local SRI-pinned JS bytes',()=>{
  const original='globalThis.opaqueMimeCanary="a-plain-unique-string";';
  const digest=createHash('sha256').update(original).digest('base64');
  const pinned=xml('<h:script src="./client.js" integrity="sha256-'+digest+'"/>');
  const htmlPinned=xml('<script src="./client.js" integrity="sha256-'+digest+'"></script>');
  const unpinned=xml('<h:script src="./client.js"/>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    for(const asset of [pinned,htmlPinned]){
      const {compiled}=compile(asset,mode);
      assert.equal(compiled.files[0].code,original,
        mode+': retain cryptographically committed public source bytes');
      assert.deepEqual(compiled.files[1].code,asset);
    }
    const {compiled}=compile(unpinned,mode);
    assert.notEqual(compiled.files[0].code,original,
      mode+': retain positive transformation for unpinned XML');
  }
});

test('unrelated XML data and ordinary binary assets preserve transformation yield',()=>{
  const assets=[
    xml('<inventory><record id="12">data only</record></inventory>'),
    Buffer.from([0,1,2,3,4,255,254,128,60,63,120,109,108])
  ];
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    for(const asset of assets){
      const {original,compiled}=compile(asset,mode);
      assert.notEqual(compiled.files[0].code,original,
        mode+': safe neighboring asset must not globally disable rewrites');
      assert.deepEqual(compiled.files[1].code,asset,
        mode+': published opaque asset bytes remain exact');
    }
  }
});

test('SVG declaration remains covered by SVG-specific diagnostic and parser',()=>{
  const svg='<?xml version="1.0" encoding="UTF-16"?>'+
    '<svg xmlns="http://www.w3.org/2000/svg"/>';
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    assert.throws(()=>obfuscateFiles([
      {path:'icon.svg',sourceType:/** @type {const} */('asset'),code:svg}
    ],{mode}),/SVG asset contains/,
    mode+': preserve SVG-specific XML encoding mismatch rejection');
  }
  assert.throws(()=>createScoHandler([
    {path:'icon.svg',sourceType:/** @type {const} */('asset'),code:svg}
  ]),/SVG asset contains/);
});
