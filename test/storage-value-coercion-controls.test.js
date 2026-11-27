'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {fixtures}=require('./storage-value-coercion-fixtures');

/** @type {Array<[keyof typeof fixtures,boolean,number]>} */
const expectations=[
  ['ownToString',false,2],
  // The computed Symbol.toPrimitive write remains an unknown source-observing key.
  ['ownSymbolToPrimitive',true,0],
  ['directBypass',true,0],
  ['prototypeOverride',false,2],
  ['patchedFunctionToString',true,0]
];

for(const [name,expectedObserved,minBindings] of expectations) {
  test('Storage conversion control: '+name,()=>{
    const source=fixtures[name];
    const ast=parse(source,'module');
    assert.equal(observesFunctionSource(ast),expectedObserved,name);
    const result=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{
      mode:'coo',
      seed:'storage-value-hooks/'+name,
      properties:false,
      identifiers:true,
      strings:false
    });
    const file=result.files[0];
    assert.ok(file,name);
    const output=String(file.code);
    if(minBindings>0) {
      assert.ok(file.metrics.bindings>=minBindings,name+': expected private rewrite yield');
      assert.ok(!output.includes('privateLocal'),name);
      assert.ok(!output.includes('independentLocal'),name);
    } else {
      assert.equal(file.metrics.bindings,0,name+': expected conservative whole-file refusal');
      assert.ok(output.includes('privateLocal'),name);
      assert.ok(output.includes('independentLocal'),name);
    }
  });
}
