'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const pathModule=require('node:path');
const {pathToFileURL}=require('node:url');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');
const {encodeStrings}=require('../src/strings');
const {renameLocalIdentifiers}=require('../src/identifiers');

test('JSON import attributes are not string-encoded and unrelated local objects remain renameable',()=>{
  const source=[
    'import data from "./config.json" with {type:"json"};',
    'const local={alpha:1};',
    'export const value=data.value+local.alpha;',
    'console.log("other-literal");'
  ].join('\n');
  const ast=parse(source,'module');
  const renamed=renameLocalProperties(source,ast,{seed:'json-attribute-local-property-diagnostic'});
  assert.match(renamed.code,/data\.value/u,
    'the imported JSON object property is not treated as a locally owned property');
  assert.doesNotMatch(renamed.code,/local\.alpha/u,
    'an unrelated locally owned object can still be renamed');
  assert.match(renamed.code,/_p[0-9a-f]{10}/u);

  const encoded=encodeStrings(source,parse(source,'module'),{
    seed:'json-attribute-string-diagnostic',minimumLength:4
  });
  assert.match(encoded.code,/from "\.\/config\.json"/u);
  assert.match(encoded.code,/with \{type:"json"\}/u);
  assert.doesNotMatch(encoded.code,/"other-literal"/u,
    'ordinary string literals remain eligible for encoding');
});

test('direct local transforms and string encoding preserve native JSON-module runtime values',async()=>{
  const directory=await fs.mkdtemp(pathModule.join(os.tmpdir(),'obfs-json-attribute-'));
  try{
    const jsonPath=pathModule.join(directory,'config.json');
    const nativePath=pathModule.join(directory,'native.mjs');
    const transformedPath=pathModule.join(directory,'transformed.mjs');
    await fs.writeFile(jsonPath,JSON.stringify({value:41}),'utf8');
    const source=[
      'import data from "./config.json" with {type:"json"};',
      'const local={alpha:1};',
      'const marker="other-literal";',
      'export const value=data.value+local.alpha;',
      'export {marker};'
    ].join('\n');
    await fs.writeFile(nativePath,source,'utf8');

    const localResult=renameLocalProperties(source,parse(source,'module'),{
      seed:'json-attribute-runtime-local'
    });
    const identifierResult=renameLocalIdentifiers(localResult.code,parse(localResult.code,'module'),{
      seed:'json-attribute-runtime-identifiers',sourceType:'module'
    });
    const stringResult=encodeStrings(identifierResult.code,parse(identifierResult.code,'module'),{
      seed:'json-attribute-runtime-strings',minimumLength:4
    });
    assert.ok(localResult.properties>0);
    assert.ok(identifierResult.bindings>0);
    assert.ok(stringResult.count>0);
    await fs.writeFile(transformedPath,stringResult.code,'utf8');

    const native=await import(pathToFileURL(nativePath).href);
    const transformed=await import(pathToFileURL(transformedPath).href);
    assert.equal(native.value,42);
    assert.equal(transformed.value,native.value);
    assert.equal(transformed.marker,native.marker);
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});
