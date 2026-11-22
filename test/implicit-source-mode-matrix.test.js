'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

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
    "const privateOwner={hiddenProperty:11};"+
    "console.log(42);export const value=calculate()+privateOwner.hiddenProperty;";
  const output=obfuscateFiles([
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'consumer.mjs',sourceType:'module',code:consumer}
  ],{mode:'coo',seed:'agent50-crossfile-primitive-positive',closedWorld:true});
  assert.equal(output.files.find(file=>file.path==='producer.mjs')?.code,producer,
    'Exported callable source must remain exact for external importers');
  assert.ok((output.files.find(file=>file.path==='consumer.mjs')?.metrics.properties??0)>0,
    'Unexported private consumer property must retain positive renaming yield');
});

/**
 * Run the original and actually generated ESM module groups as independent
 * Node processes. The two graphs share relative import structure and external
 * console I/O. Temporary source writes are atomic and locked.
 */
test('real multi-file ESM native and emitted console traces stay equivalent',async()=>{
  const scenarios=[
    {
      name:'primitive',
      producer:"const owner={longPrivateField:73};"+
        "export function compute(){return owner.longPrivateField;}",
      consumer:"import {compute} from './producer.mjs';"+
        "const localPrivate={hiddenProperty:11};console.log(42,compute());"+
        "export const privateValue=localPrivate.hiddenProperty;"
    },
    {
      name:'function',
      producer:"export function visiblyNamedExport(){"+
        "const owner={longPrivateField:73};return owner.longPrivateField;}",
      consumer:"import {visiblyNamedExport} from './producer.mjs';"+
        "console.log(visiblyNamedExport);console.log(visiblyNamedExport());"
    }
  ];
  const directory=await mkdtemp(path.join(tmpdir(),'obfs-source-mode-'));
  try {
    for(const scenario of scenarios) {
      /** @type {import('../src/core').SourceFile[]} */
      const files=[
        {path:'producer.mjs',sourceType:'module',code:scenario.producer},
        {path:'consumer.mjs',sourceType:'module',code:scenario.consumer}
      ];
      const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
        seed:'agent50-real-esm-'+scenario.name});
      /** @param {string} relative @param {{path:string,code:string|Buffer}[]} sources */
      async function build(relative,sources) {
        const destination=path.join(directory,relative);
        for(const item of sources) {
          await atomicWrite(path.join(destination,item.path),item.code);
        }
        const processResult=spawnSync(process.execPath,[
          path.join(destination,'consumer.mjs')
        ],{encoding:'utf8',timeout:10000});
        assert.equal(processResult.error,undefined);
        assert.equal(processResult.status,0,processResult.stderr);
        return processResult.stdout;
      }
      const native=await build(scenario.name+'-native',files);
      const emitted=await build(scenario.name+'-emitted',output.files);
      assert.equal(emitted,native,scenario.name);
      assert.match(native,/73/);
      if(scenario.name==='primitive') {
        assert.equal(output.files[0].code,scenario.producer,
          'Preserve externally observable exported function source');
        assert.ok(output.files[1].metrics.properties>0,
          'Unexported consumer local owner must retain property mangling');
      }
      else
        assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
    }
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
});
