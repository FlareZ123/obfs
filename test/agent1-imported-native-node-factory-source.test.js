'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const literal='globalThis._importedNativeValue="a local no-SRI script remains eligible for string rewriting";';
const importAndInsert='import {build as makeNode} from "./factory.mjs";'+
  'const script=makeNode();script.src="./client.js";document.head.append(script);';

/**
 * @param {string} factory
 * @param {string} [consumer]
 * @param {'coo'|'sno'|'sco'} [mode]
 */
function compile(factory,consumer=importAndInsert,mode='coo'){
  return obfuscateFiles([
    {path:'client.js',sourceType:'script',code:literal},
    {path:'factory.mjs',sourceType:'module',code:factory},
    {path:'bootstrap.mjs',sourceType:'module',code:consumer},
    {path:'index.html',sourceType:'asset',code:Buffer.from(
      '<!doctype html><script type="module" src="./bootstrap.mjs"></script>')}
  ],{mode,seed:'agent1-pure-esm-native-factory/'+mode,
    closedWorld:true,strings:true,identifiers:false,properties:false});
}

test('immutable closed ESM native Node factory permits no-SRI protected client output',()=>{
  for(const factory of [
    'export function build(){return document.createElement("script");}',
    'export const build=()=>document.createElement("script");'
  ])for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=compile(factory,importAndInsert,mode);
    assert.notEqual(String(out.files[0].code),literal,
      'Syntactically proven imported native Node is not a callable DOMString source: '+factory+'/'+mode);
    assert.ok(out.files[0].metrics.literals>0,
      'Positive case must encode actual non-vacuous source content: '+mode);
  }
});

test('mutable donor factory and function-returning donor preserve sibling source',()=>{
  const unsafe=[
    'export let build=()=>document.createElement("script");build=()=>function source(){return 37;};',
    'export const build=()=>function source(){const secret=29;return secret;};',
    'export function build(){const v=globalThis.hostFactory;return v();}',
    'const document={createElement(){return function source(){return 13;};}};'+
      'export const build=()=>document.createElement("script");',
    'export const build=()=>document[globalThis.hostMethod]("script");',
    'export function build(){globalThis.hostSideEffect();return document.createElement("script");}'
  ];
  for(const factory of unsafe)for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=compile(factory,importAndInsert,mode);
    assert.equal(String(out.files[0].code),literal,
      'An opaque/mutable factory must remain a potential DOMString source '+mode+' '+factory);
  }
});

test('consuming a proved factory through a mutable result, opaque key or side effect refuses',()=>{
  const factory='export const build=()=>document.createElement("script");';
  const consumers=[
    'import {build} from "./factory.mjs";let script=build();'+
      'script=globalThis.hostFunction;document.head.append(script);',
    'import {build} from "./factory.mjs";const script=build();'+
      'document.head[globalThis.hostMethod](script);',
    'import {build} from "./factory.mjs";const script=build(globalThis.host());'+
      'document.head.append(script);',
    'import {build} from "./factory.mjs";const script=build();'+
      'document.head.append(build);',
    // This external pre-call effect may change Document.prototype.
    // A static imported-factory proof must not assume opaque host calls
    // preserve native intrinsics when they occur before factory invocation.
    'import {build} from "./factory.mjs";globalThis.poisonDocument();'+
      'const script=build();document.head.append(script);',
    // A second factory call after an opaque operation has no native guarantee
    // even when the first call returns a genuine Node.
    'import {build} from "./factory.mjs";const first=build();'+
      'globalThis.poisonDocument();const second=build();document.head.append(second);'
  ];
  for(const consumer of consumers)for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=compile(factory,consumer,mode);
    assert.equal(String(out.files[0].code),literal,
      'Non-private factory/receiver paths must refuse '+mode+' '+consumer);
  }
});

test('sibling native factory replacement invalidates otherwise pure imported Node proof',()=>{
  const factory='export const build=()=>document.createElement("script");';
  for(const mutation of [
    'document.createElement=function(){return function source(){const secret=1;return secret;};};',
    'globalThis.Document.prototype.createElement=function(){return function source(){return 9;};};'
  ])for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:literal},
      {path:'factory.mjs',sourceType:'module',code:factory},
      {path:'bootstrap.mjs',sourceType:'module',code:importAndInsert},
      {path:'mutation.js',sourceType:'script',code:mutation}
    ],{mode,seed:'agent1-native-ESM-factory-mutated/'+mode,
      closedWorld:true,strings:true,identifiers:false,properties:false});
    assert.equal(String(out.files[0].code),literal,
      'A visible sibling native factory mutation must disable the exception '+mode);
  }
});


test('opaque HTML host mutation assets invalidate a no-inline ESM native factory proof',()=>{
  const factory='export const build=()=>document.createElement("script");';
  const poison='document.createElement=function(){return function source(){return 19;};};';
  const pages=[
    '<script>'+poison+'</script><script type="module" src="./bootstrap.mjs"></script>',
    '<html><body onload="'+poison.replaceAll('"','&quot;')+'">'+
      '<script type="module" src="./bootstrap.mjs"></script></body></html>',
    '<iframe srcdoc="&lt;script&gt;'+poison+'&lt;/script&gt;"></iframe>'+
      '<script type="module" src="./bootstrap.mjs"></script>',
    '<script src="./unprovided-host.js"></script>'+
      '<script type="module" src="./bootstrap.mjs"></script>',
    '<svg onload="'+poison.replaceAll('"','&quot;')+'"></svg>'+
      '<script type="module" src="./bootstrap.mjs"></script>'
  ];
  for(const page of pages)for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const emitted=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:literal},
      {path:'factory.mjs',sourceType:'module',code:factory},
      {path:'bootstrap.mjs',sourceType:'module',code:importAndInsert},
      {path:'index.html',sourceType:'asset',code:Buffer.from(page)}
    ],{mode,seed:'agent1-inline-host-mutates-native-factory/'+mode,
      closedWorld:true,strings:true,identifiers:false,properties:false});
    assert.equal(String(emitted.files[0].code),literal,
      'An opaque HTML host execution surface may replace a native Node producer '+mode+' '+page);
  }
});
