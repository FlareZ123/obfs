'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasNativeDocumentFactoryMutation}=require('../src/ast');
const {obfuscateFiles}=require('../src');

const poison='function replacement(){return function inspected(){const sourceLiteral=43;return sourceLiteral;};}';
const hostile=[
  'Reflect.getPrototypeOf(document).createElement='+poison+';',
  'const proto=Reflect.getPrototypeOf(document);proto.createElement='+poison+';',
  'const d=window.document;const p=Reflect.getPrototypeOf(d);p.createElement='+poison+';',
  'Reflect.getPrototypeOf(window.document).__proto__.createElement='+poison+';',
  'Reflect.set(Reflect.getPrototypeOf(document),"createElement",'+poison+');',
  'Object.defineProperty(Reflect.getPrototypeOf(document),"createElement",{value:'+poison+'});',
  'Object.assign(Reflect.getPrototypeOf(document),{createElement:'+poison+'});'
];
test('Reflect.getPrototypeOf(Document) mutation is not a native-Node proof',()=>{
  for(const source of hostile) assert.equal(
    hasNativeDocumentFactoryMutation(parse(source,'script')),true,
    'Native Document prototype mutated through Reflect.getPrototypeOf: '+source);
});
test('Reflect.getPrototypeOf read and irrelevant member writes retain native positive yield',()=>{
  const harmless=[
    'const proto=Reflect.getPrototypeOf(document);void proto.createElement;',
    'const proto=Reflect.getPrototypeOf(document);proto.title="other value";',
    'Reflect.set(Reflect.getPrototypeOf(document),"title","unrelated");',
    'Reflect.getPrototypeOf({}).createElement='+poison+';'
  ];
  for(const source of harmless) assert.equal(
    hasNativeDocumentFactoryMutation(parse(source,'script')),false,
    'Harmless Reflect prototype use mislabeled: '+source);
});
test('source-visible sibling Reflect native constructor override blocks client rewrite',()=>{
  const client='globalThis.reflectNativeSource="a client payload must preserve byte-for-byte source observable in a DOMString";';
  const loader='const element=document.createElement("script");document.head.append(element);';
  for(const source of hostile)for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:client},
      {path:'poison.js',sourceType:'script',code:source},
      {path:'loader.js',sourceType:'script',code:loader}
    ],{mode,seed:'agent1-native-reflect-mutation/'+mode,
      strings:true,identifiers:false,properties:false});
    assert.equal(String(out.files[0].code),client,
      'Cross-file Reflect.getPrototypeOf native mutation must veto source rewrite '+mode);
  }
});
test('unmutated Reflect prototype read retains actual client string encoding',()=>{
  const client='globalThis.reflectNativeSource="native read-only Document prototypes permit source encoding";';
  const loader='const element=document.createElement("script");document.head.append(element);';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:client},
      {path:'read.js',sourceType:'script',code:'const p=Reflect.getPrototypeOf(document);void p.createElement;'},
      {path:'loader.js',sourceType:'script',code:loader}
    ],{mode,seed:'agent1-native-reflect-positive/'+mode,
      strings:true,identifiers:false,properties:false});
    assert.notEqual(String(out.files[0].code),client,
      'Read-only Reflect prototype observation must not over-refuse '+mode);
    assert.ok(out.files[0].metrics.literals>0);
  }
});
