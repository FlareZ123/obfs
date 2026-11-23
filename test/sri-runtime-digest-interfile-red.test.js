'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sco'|'sno'} Mode */
/** @typedef {{path:string,sourceType:'script'|'module'|'asset',code:string|Buffer}} Source */
const source='document.documentElement.dataset.runtimeDigestSri="loaded";'+
  'globalThis.runtimeDigestSri="separate module computes an exact digest from a public byte array";';

/**
 * A digest reconstructed at runtime is absent as a contiguous hash token from
 * every source file. Static source observers must instead propagate an
 * imported factory's possible HTMLScriptElement return provenance.
 * @param {boolean} pinned
 * @returns {Source[]}
 */
function fixture(pinned){
  const digestBytes=[...createHash('sha256').update(source).digest()];
  const factory='export function make(){return document.createElement("script");}';
  const setup='import {make} from "./factory.mjs";'+
    'const script=make();script.src="./client.js";';
  const dynamicSri=pinned?
    'const digest=btoa(String.fromCharCode(...'+JSON.stringify(digestBytes)+'));'+
    'const name=globalThis.opaqueAttrName||"integrity";'+
    'script[name]="sha256-"+digest;':'';
  const bootstrap=setup+dynamicSri+'document.head.append(script);';
  return [
    {path:'client.js',sourceType:'script',code:source},
    {path:'factory.mjs',sourceType:'module',code:factory},
    {path:'bootstrap.mjs',sourceType:'module',code:bootstrap},
    {path:'index.html',sourceType:'asset',code:Buffer.from(
      '<!doctype html><html><head><script type="module" src="./bootstrap.mjs">'+
      '</script></head><body>Runtime-digest SRI</body></html>')}
  ];
}

/** @param {Mode} mode @param {boolean} pin @returns {string} */
function compile(mode,pin){
  return /** @type {string} */(obfuscateFiles(fixture(pin),{
    mode,closedWorld:true,seed:'runtime-assembled-dom-sri/'+mode,
    strings:true,identifiers:false,properties:false
  }).files[0].code);
}

test('cross-file DOM factory plus runtime-constructed SRI preserves client bytes',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
    assert.equal(compile(mode,true),source,
      mode+': native browser enforces computed SRI metadata over original bytes');
  }
});

test('without runtime integrity the same imported factory retains rewrite yield',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
    assert.notEqual(compile(mode,false),source,
      mode+': unpinned JavaScript should remain transformable');
  }
});
