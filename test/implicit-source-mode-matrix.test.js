'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Single-file Node console tracing is a source-coordinate observer in every
 * compiler mode. Suppressing only property renaming is insufficient if the
 * compiler would otherwise insert string decoders or rename bindings.
 */
for(const mode of ['coo','sno','sco']) {
  test(mode+' preserves one-file native trace layout across the whole compiler',()=>{
    const source="'use strict';function calculate(){const owner={longPrivateField:73};"+
      "const value=owner.longPrivateField;console.trace();return value;}"+
      "module.exports=calculate();";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'agent50-source-observer-mode-'+mode}).files[0];
    assert.equal(output.code,source);
    assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
  });
}

/**
 * The consumer prints an imported function's source-sensitive name/shape,
 * so even independently safe source rewrites in the producer are refused
 * for the complete closed-world graph.
 */
for(const mode of ['coo','sco']) {
  test(mode+' preserves all ESM sources when an imported function is logged',()=>{
    const producer="export function visiblyNamedExport(){"+
      "const owner={longPrivateField:73};return owner.longPrivateField;}";
    const consumer="import {visiblyNamedExport} from './producer.mjs';"+
      "console.log(visiblyNamedExport);export const value=visiblyNamedExport();";
    const result=obfuscateFiles([
      {path:'producer.mjs',sourceType:'module',code:producer},
      {path:'consumer.mjs',sourceType:'module',code:consumer}
    ],{mode,seed:'agent50-crossfile-logger-'+mode,closedWorld:true});
    assert.equal(result.crossFile.objects,0);
    assert.equal(result.crossFile.properties,0);
    assert.equal(result.files.find(file=>file.path==='producer.mjs')?.code,producer);
    assert.equal(result.files.find(file=>file.path==='consumer.mjs')?.code,consumer);
    for(const file of result.files) {
      assert.deepEqual(file.metrics,{literals:0,objects:0,properties:0,bindings:0});
    }
  });
}

test('cross-module primitive-only logging does not suppress all transforms',()=>{
  const producer="const owner={longPrivateField:73};"+
    "export function calculate(){return owner.longPrivateField;}";
  const consumer="import {calculate} from './producer.mjs';"+
    "console.log(42);export const value=calculate();";
  const output=obfuscateFiles([
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'consumer.mjs',sourceType:'module',code:consumer}
  ],{mode:'coo',seed:'agent50-crossfile-primitive-positive',closedWorld:true});
  assert.ok(output.files.some(file=>file.code!==[producer,consumer][
    file.path==='producer.mjs'?0:1
  ]),JSON.stringify(output));
});
