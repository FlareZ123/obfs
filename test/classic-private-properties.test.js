'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');

/**
 * A group of classic browser scripts shares one global lexical environment.
 * @param {string[]} scripts
 * @returns {string}
 */
function run(scripts) {
  const context=vm.createContext({});
  for(const source of scripts)vm.runInContext(source,context,{timeout:2000});
  return JSON.stringify([
    context.first,context.second,context.result,context.spelling
  ]);
}

/**
 * @param {string[]} scripts
 * @param {import('../src/core').ObfuscationOptions} [options]
 * @returns {import('../src/core').OutputFile[]}
 */
function transform(scripts,options={}) {
  return obfuscateFiles(scripts.map((code,index)=>({
    path:'script'+index+'.js',sourceType:'script',code
  })),{
    mode:'coo',seed:'classic-private-proof',strings:false,identifiers:false,
    closedWorld:true,...options
  }).files;
}

test('closed-world classic scripts rename only private function-owned keys',()=>{
  const scripts=[
    'function compute(mult){const state={secretField:11,bonusField:3};' +
      'return state.secretField*mult+state.bonusField;}globalThis.first=compute(2);',
    'globalThis.second=compute(7);'
  ];
  const emitted=transform(scripts);
  assert.equal(emitted[0].metrics.objects,1);
  assert.equal(emitted[0].metrics.properties,2);
  assert.equal(emitted[1].metrics.properties,0);
  assert.doesNotMatch(/** @type {string} */(emitted[0].code),/\.secretField\b/u);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('block-scoped owner with no globally exported references can be renamed',()=>{
  const scripts=['{const state={secretField:17,bonusField:6};' +
    'globalThis.result=state.secretField+state.bonusField;}'];
  const emitted=transform(scripts);
  assert.equal(emitted[0].metrics.properties,2);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('script Program-level lexical object is deliberately left unchanged across files',()=>{
  const scripts=[
    'const shared={secretField:13};globalThis.first=shared.secretField;',
    'globalThis.second=shared.secretField;'
  ];
  const emitted=transform(scripts);
  assert.equal(emitted[0].metrics.properties,0);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('private object passed to opaque ambient API retains original property spelling',()=>{
  const scripts=[
    'globalThis.api={read(obj){return obj.secretField}};',
    'function compute(){const state={secretField:7};' +
      'return globalThis.api.read(state);}globalThis.result=compute();'
  ];
  const emitted=transform(scripts);
  assert.equal(emitted[1].metrics.properties,0);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('dynamic field read refuses private-property renaming',()=>{
  const scripts=[
    'globalThis.key="secretField";',
    'function compute(){const state={secretField:23};' +
      'return state[globalThis.key];}globalThis.result=compute();'
  ];
  const emitted=transform(scripts);
  assert.equal(emitted[1].metrics.properties,0);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('cross-script Function#toString observer refuses source rewriting',()=>{
  const scripts=[
    'function compute(){const state={secretField:29};' +
      'return state.secretField;}globalThis.result=compute();',
    'globalThis.spelling=compute.toString();'
  ];
  const emitted=transform(scripts);
  assert.equal(emitted[0].metrics.properties,0);
  assert.equal(run(emitted.map(f=>/** @type {string} */(f.code))),run(scripts));
});

test('classic private-property rewriting requires an explicit closed-world contract',()=>{
  const source='function compute(){const state={secretField:7};' +
    'return state.secretField;}globalThis.result=compute();';
  for(const option of [{closedWorld:false},{experimentalSymbolKeys:true}]) {
    const emitted=transform([source],option);
    assert.equal(emitted[0].metrics.properties,0);
    assert.equal(run([/** @type {string} */ (emitted[0].code)]),run([source]));
  }
});

test('independent public-token normalizer strips generated hash labels',()=>{
  const source='function compute(){const state={secretField:17,bonusField:9};' +
    'return state.secretField+state.bonusField;}globalThis.result=compute();';
  const [output]=transform([source]);
  assert.equal(output.metrics.properties,2);
  const normalized=normalizeDistributedFiles([{
    path:output.path,sourceType:'script',code:/** @type {string} */(output.code)
  }]);
  assert.equal(normalized.properties,2);
  assert.doesNotMatch(normalized.files[0].code,/_p[a-f0-9]{10}\b/u);
  assert.equal(run([normalized.files[0].code]),run([source]));
});

test('checked-in actual classic-script before/after is compiler-identical',async()=>{
  const root=path.join(__dirname,'../examples/classic-private');
  const before=(await fs.readFile(path.join(root,'before.js'),'utf8')).replace(/\r\n/gu,'\n');
  const after=(await fs.readFile(path.join(root,'after.js'),'utf8')).replace(/\r\n/gu,'\n');
  const result=obfuscateFiles([{
    path:'app.js',sourceType:'script',code:before
  }],{
    mode:'coo',seed:'classic-private-example-v1',closedWorld:true,
    identifiers:false,strings:false
  }).files[0];
  assert.equal(result.metrics.properties,2);
  assert.equal(result.code,after);
  assert.equal(run([after]),run([before]));
});
