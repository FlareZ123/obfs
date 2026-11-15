'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {buildSample}=require('../examples/local-reader/build-sample.cjs');

/** @param {string} source @returns {string} */
function execute(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} helper @param {number} expectedObjects @returns {void} */
function verify(helper,expectedObjects){
  const source='const root={secretField:7,otherField:5};'+helper+
    'module.exports=[reader(root),root.otherField];';
  const expected=execute(source);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    const transformed=obfuscateFiles([
      {path:'reader.cjs',sourceType:'commonjs',code:source}
    ],{mode,seed:'local-reader-proof',strings:false,identifiers:false});
    const output=/** @type {string} */ (transformed.files[0].code);
    assert.equal(transformed.files[0].metrics.objects,expectedObjects,source);
    assert.equal(transformed.files[0].metrics.properties,expectedObjects*2,source);
    assert.equal(execute(output),expected,mode+'/'+source);
    if(expectedObjects){
      assert.doesNotMatch(output,/\.secretField|\.otherField/u);
      assert.doesNotMatch(output,/\["secretField"\]|\["otherField"\]/u);
      assert.match(output,/\._p[0-9a-f]{10}/u);
    }else assert.equal(output,source);
  }
}

for(const [name,helper] of [
  ['arrow expression','const reader=x=>x.secretField;'],
  ['arrow block','const reader=x=>{return x.secretField;};'],
  ['anonymous function expression',
    'const reader=function(x){return x.secretField;};'],
  ['named function expression',
    'const reader=function internal(x){return x["secretField"];};'],
  ['computed literal key','const reader=x=>x["secretField"];'],
  ['function declaration','function reader(x){return x.secretField;}']
]){
  test('local read-only helper is a proven property consumer: '+name,()=>verify(helper,1));
}

test('local reader can consume the private object through a pure identity',()=>{
  const source='const root={secretField:7,otherField:5};'+
    'const forward=y=>y;const reader=x=>x.secretField;'+
    'module.exports=[reader(forward(root)),root.otherField];';
  const transformed=obfuscateFiles([
    {path:'reader.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'local-reader-composition',strings:false,identifiers:false});
  assert.equal(transformed.files[0].metrics.objects,1);
  assert.equal(execute(/** @type {string} */ (transformed.files[0].code)),execute(source));
});

for(const [name,source] of [
  ['called on second owner',
    'const root={secretField:7,otherField:5};const foreign={secretField:9};'+
    'const reader=x=>x.secretField;module.exports=[reader(root),reader(foreign)];'],
  ['nested forwarding with ambiguous receiving parameter',
    'const root={secretField:7,otherField:5};const foreign={secretField:9};'+
    'const forward=y=>y;const reader=x=>x.secretField;'+
    'module.exports=[reader(forward(root)),reader(forward(foreign))];'],
  ['escaped as a first-class value',
    'const root={secretField:7,otherField:5};const reader=x=>x.secretField;'+
    'const escaped=reader;module.exports=escaped(root);'],
  ['dynamic computed key',
    'const root={secretField:7,otherField:5};const reader=x=>x[globalThis.key];'+
    'module.exports=reader(root);'],
  ['mutable helper',
    'const root={secretField:7,otherField:5};let reader=x=>x.secretField;'+
    'module.exports=reader(root);'],
  ['function-source observation',
    'const root={secretField:7,otherField:5};const reader=x=>x.secretField;'+
    'module.exports=[reader(root),reader.toString()];']
]){
  test('unproved local reader flow declines: '+name,()=>{
    const result=obfuscateFiles([
      {path:'reader.cjs',sourceType:'commonjs',code:source}
    ],{mode:'sno',seed:'local-reader-refusal',strings:false,identifiers:false});
    assert.equal(result.files[0].metrics.objects,0,name);
    assert.equal(result.files[0].code,source,name);
    assert.equal(execute(/** @type {string} */ (result.files[0].code)),execute(source),name);
  });
}

test('reader return value remains a scalar rather than an owner alias',()=>{
  const source='const root={secretField:7,otherField:5};'+
    'const reader=x=>x.secretField;const result=reader(root);'+
    'module.exports=[result.secretField,typeof result];';
  const output=obfuscateFiles([
    {path:'reader.cjs',sourceType:'commonjs',code:source}
  ],{mode:'coo',seed:'reader-result-not-alias',strings:false,identifiers:false});
  assert.equal(output.files[0].metrics.objects,1);
  assert.equal(execute(/** @type {string} */ (output.files[0].code)),execute(source));
});

test('seedless source-only adversary neutralizes local reader property hashes',()=>{
  const source='const root={secretField:7,otherField:5};'+
    'const reader=x=>x.secretField;module.exports=[reader(root),root.otherField];';
  const transformed=obfuscateFiles([
    {path:'reader.cjs',sourceType:'commonjs',code:source}
  ],{mode:'coo',seed:'unpublished-seed-probe',strings:false,identifiers:false});
  const output=/** @type {string} */ (transformed.files[0].code);
  assert.equal(transformed.files[0].metrics.properties,2);
  const attack=neutralizeHashedNames([
    {path:'reader.cjs',sourceType:'commonjs',code:output}
  ]);
  assert.equal(attack.properties,2);
  assert.equal(execute(attack.files[0].code),execute(source));
  assert.doesNotMatch(attack.files[0].code,/_p[0-9a-f]{10}/u);
});

test('checked-in local reader sample exactly matches emitted code',async()=>{
  await buildSample(true);
  const directory=path.resolve(__dirname,'../examples/local-reader');
  const before=await fs.readFile(path.join(directory,'before.cjs'),'utf8');
  const after=await fs.readFile(path.join(directory,'after.cjs'),'utf8');
  assert.notEqual(before,after);
  assert.equal(execute(before),execute(after));
});
