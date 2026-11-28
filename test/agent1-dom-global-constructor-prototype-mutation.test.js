'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasNativeDocumentFactoryMutation}=require('../src/ast');
const {obfuscateFiles}=require('../src');

const poison='function replacement(){return function inspected(){const secretSource=107;return secretSource;};}';

/**
 * The native Node proof is valid only while the Document constructor's
 * createElement method retains its native implementation. Mutating it through
 * a global member or an immutable local constructor/prototype alias is not a
 * harmless userland property update.
 *
 * @type {readonly string[]}
 */
const hostileWrites=[
  'globalThis.Document.prototype.createElement='+poison+';',
  'window.Document.prototype["createElement"]='+poison+';',
  'self["Document"]["prototype"]["createElement"]='+poison+';',
  'const C=globalThis.Document;C.prototype.createElement='+poison+';',
  'const root=globalThis;const C=root.Document;C.prototype.createElement='+poison+';',
  'const {Document:C}=globalThis;C.prototype.createElement='+poison+';',
  'const proto=window.Document.prototype;proto.createElement='+poison+';',
  'Reflect.set(globalThis.Document.prototype,"createElement",'+poison+');',
  'Object.defineProperty(window.Document.prototype,"createElement",{value:'+poison+'});',
  'Object.assign(globalThis.Document.prototype,{createElement:'+poison+'});'
];

test('global Document.prototype and constructor-alias writes veto native Node provenance',()=>{
  for(const code of hostileWrites){
    assert.equal(hasNativeDocumentFactoryMutation(parse(code,'script')),true,
      'A reachable Document prototype factory mutation was missed: '+code);
  }
});

test('read-only constructor/prototype aliases do not spuriously invalidate native Node proof',()=>{
  const harmless=[
    'const factory=globalThis.Document.prototype.createElement;',
    'const C=window.Document;const proto=C.prototype;void proto.createElement;',
    'const {Document:C}=globalThis;const method=C.prototype.createElement;',
    'globalThis.Document.prototype.title="harmless metadata";'
  ];
  for(const code of harmless){
    assert.equal(hasNativeDocumentFactoryMutation(parse(code,'script')),false,
      'A read-only or unrelated field must not be mistaken for factory mutation: '+code);
  }
});

test('sibling global-constructor mutation must refuse synthetic native Node source exemption',()=>{
  const original='globalThis.protoFactorySource="this string cannot be rewritten when a function source is observed";';
  const loader='const node=document.createElement("script");document.head.append(node);';
  for(const mutation of hostileWrites){
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const result=obfuscateFiles([
        {path:'client.js',sourceType:'script',code:original},
        {path:'mutation.js',sourceType:'script',code:mutation},
        {path:'loader.js',sourceType:'script',code:loader}
      ],{mode,seed:'agent1-document-global-prototype-veto/'+mode,
        strings:true,properties:false,identifiers:false});
      assert.equal(result.files[0].code,original,
        'Source-sensitive sibling factory mutation did not veto '+mode+': '+mutation);
    }
  }
});

test('native unmodified Document node insertion retains non-vacuous string rewrite yield',()=>{
  const original='globalThis.nativeNodeYield="this ordinary unpinned string should be protected";';
  const loader='const node=document.createElement("script");document.head.append(node);';
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:original},
      {path:'loader.js',sourceType:'script',code:loader}
    ],{mode,seed:'agent1-document-native-positive/'+mode,
      strings:true,properties:false,identifiers:false});
    assert.notEqual(out.files[0].code,original,
      'Native unmutated Node must retain actual client protection '+mode);
  }
});
