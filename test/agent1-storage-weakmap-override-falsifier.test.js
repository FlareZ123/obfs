'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {fixtures}=require('./storage-value-coercion-fixtures');

/**
 * @param {string} source
 * @param {string} seed
 */
function compile(source,seed){
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed,properties:false,identifiers:true,strings:false
  });
  const app=result.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  return app;
}

const weakMapPrototypeMutation=fixtures.prototypeOverride.replace(
  'const captured=new WeakMap();',
  [
    'const captured=new WeakMap();',
    'const nativeWeakMapSet=WeakMap.prototype.set;',
    'WeakMap.prototype.set=function(key,value){return nativeWeakMapSet.call(this,key,String(value));};'
  ].join('\n')
);

const exportedWeakMap=fixtures.prototypeOverride.replace(
  'const captured=new WeakMap();',
  'export const captured=new WeakMap();'
);

test('private unmodified WeakMap-backed Storage override remains a reference-only positive control',()=>{
  const ast=parse(fixtures.prototypeOverride,'module');
  assert.equal(observesFunctionSource(ast),false);
  const app=compile(fixtures.prototypeOverride,'agent1-weakmap-reference-only-positive');
  assert.ok(app.metrics.bindings>=2,
    JSON.stringify({metrics:app.metrics,code:app.code}));
  assert.ok(!String(app.code).includes('privateLocal'));
  assert.ok(!String(app.code).includes('independentLocal'));
});

test('WeakMap.prototype.set string coercion invalidates reference-only Storage override',()=>{
  const ast=parse(weakMapPrototypeMutation,'module');
  assert.equal(observesFunctionSource(ast),true,
    'a patched WeakMap intrinsic can stringify the stored function');
  const app=compile(weakMapPrototypeMutation,'agent1-weakmap-prototype-set-negative');
  assert.equal(app.metrics.bindings,0,
    JSON.stringify({metrics:app.metrics,code:app.code}));
  assert.ok(String(app.code).includes('privateLocal'));
});

test('exported WeakMap backing store invalidates reference-only Storage override',()=>{
  const ast=parse(exportedWeakMap,'module');
  assert.equal(observesFunctionSource(ast),true,
    'an exported WeakMap can have its instance set method replaced by a consumer');
  const app=compile(exportedWeakMap,'agent1-weakmap-exported-instance-negative');
  assert.equal(app.metrics.bindings,0,
    JSON.stringify({metrics:app.metrics,code:app.code}));
  assert.ok(String(app.code).includes('privateLocal'));
});
