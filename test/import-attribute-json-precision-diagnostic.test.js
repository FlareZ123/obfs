'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');
const {encodeStrings}=require('../src/strings');

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
