'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sco'|'sno'} Mode */
/** @typedef {{path:string,code:string|Buffer,sourceType:'script'|'module'|'asset'}} Source */

const client='document.documentElement.dataset.dynamicUrlSri="loaded";'+
  'globalThis.dynamicUrlSri="source pinned under opaque URL-safe SRI token nonce 1";';
const digest=createHash('sha512').update(client).digest('base64url');
assert.match(digest.slice(0,8),/[-_]/u,'the first eight characters must exercise the regex gap');

/**
 * Imported DOM script factory and an opaque computed setter in a different
 * module. Dynamic receiver provenance is absent at the consumer. The exact
 * source digest is URL-safe and defeats the current literal SRI fallback.
 * @param {boolean} pin
 * @returns {Source[]}
 */
function fixture(pin){
  const factory='export function build(){return document.createElement("script");}';
  const prefix='import {build} from "./factory.mjs";'+
    'const script=build();script.src="./client.js";';
  const setter=pin?
    'const attr=globalThis.opaqueIntegrityName||"integrity";'+
      'script[attr]="sha512-'+digest+'";':'';
  const bootstrap=prefix+setter+'document.head.append(script);';
  return [
    {path:'client.js',sourceType:'script',code:client},
    {path:'factory.mjs',sourceType:'module',code:factory},
    {path:'bootstrap.mjs',sourceType:'module',code:bootstrap},
    {path:'index.html',sourceType:'asset',
      code:Buffer.from('<!doctype html><html><head><script type="module"'+
        ' src="./bootstrap.mjs"></script></head><body>dynamic hash</body></html>')}
  ];
}

/** @param {Mode} mode @param {boolean} pin @returns {string} */
function compile(mode,pin){
  const graph=fixture(pin);
  const output=obfuscateFiles(graph,{
    mode,closedWorld:true,seed:'dynamic-urlsafe-opaque-red/'+mode,
    strings:true,identifiers:false,properties:false
  });
  return /** @type {string} */(output.files[0].code);
}

test('opaque cross-file DOM script with SHA512 base64url digest pins sibling bytes',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
    assert.equal(compile(mode,true),client,
      mode+': the browser refuses mutated script with URL-safe SRI digest');
  }
});

test('opaque imported-factory SHA384 Base64URL underscore also pins source',()=>{
  const source='globalThis.dynamicUrlSri="source pinned under opaque URL-safe SRI token sha384 nonce 0";';
  const hash=createHash('sha384').update(source).digest('base64url');
  assert.match(hash.slice(0,8),/_/u);
  const graph=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'factory.mjs',sourceType:/** @type {const} */('module'),
      code:'export function build(){return document.createElement("script");}'},
    {path:'bootstrap.mjs',sourceType:/** @type {const} */('module'),
      code:'import {build} from "./factory.mjs";const script=build();'+
        'script.src="./client.js";const name=globalThis.optionalName||"integrity";'+
        'script[name]="sha384-'+hash+'";document.head.append(script);'}
  ];
  for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
    const compiled=obfuscateFiles(graph,{mode,closedWorld:true,
      seed:'url-safe-underscore/'+mode,
      strings:true,identifiers:false,properties:false});
    assert.equal(compiled.files[0].code,source,
      mode+': underscore within eight Base64URL characters pins original bytes');
  }
});

test('unrelated cross-file DOM factory without integrity retains rewrite yield',()=>{
  for(const mode of /** @type {Mode[]} */(['coo','sco','sno'])){
    assert.notEqual(compile(mode,false),client,
      mode+': unpinned private script must remain eligible for rewriting');
  }
});
