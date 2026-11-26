'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {fixtures}=require('./storage-value-coercion-fixtures');

const source=fixtures.prototypeOverride.replace(
  'const captured=new WeakMap();',
  [
    'const privateMap=new WeakMap();',
    'function consume(map){return map.get("key");}',
    'consume(privateMap);',
    'const captured=new WeakMap();'
  ].join('\n')
);

test('a private WeakMap passed only to a known local reader does not expose its prototype',()=>{
  const ast=parse(source,'module');
  const observed=observesFunctionSource(ast);
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'agent3-private-weakmap-local-reader-precision',
    properties:false,
    identifiers:true,
    strings:false
  });
  const app=result.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const evidence={observed,metrics:app.metrics,code:app.code};
  assert.equal(observed,false,JSON.stringify(evidence));
  assert.ok(app.metrics.bindings>=2,JSON.stringify(evidence));
  assert.ok(!String(app.code).includes('privateLocal'),JSON.stringify(evidence));
  assert.ok(!String(app.code).includes('independentLocal'),JSON.stringify(evidence));
});
