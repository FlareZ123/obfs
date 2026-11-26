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
  const observed=observesFunctionSource(ast);
  assert.equal(observed,true,'an exported WeakMap can be mutated by its consumer');
  const app=compile(exportedWeakMap,'agent1-weakmap-exported-instance-negative');
  assert.equal(app.metrics.bindings,0,
    JSON.stringify({observed,metrics:app.metrics,code:app.code}));
  assert.ok(String(app.code).includes('privateLocal'));
});


/**
 * Execute the fixture with a host-mutated exported WeakMap. The host replaces
 * the exported instance's set method so it observes String(value), then stores
 * the original reference using the captured intrinsic.
 * @param {string} source
 * @returns {Promise<{result:unknown,capturedSource:string|null}>}
 */
let sourceCaptureSequence=0;
async function runWithSourceCapture(source){
  class TestStorage {
    constructor(){this.data=new Map();}
    /** @param {string} key @param {unknown} value */
    setItem(key,value){this.data.set(String(key),String(value));}
    /** @param {string} key */
    getItem(key){return this.data.has(key)?this.data.get(key):null;}
  }
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'Storage');
  const previousLocalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'Storage',{configurable:true,writable:true,value:TestStorage});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:new TestStorage()});
  let capturedSource=null;
  try{
    const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+String(++sourceCaptureSequence);
    const module=await import(url);
    const nativeSet=module.captured.set;
    module.captured.set=function(key,value){
      capturedSource=String(value);
      return Reflect.apply(nativeSet,this,[key,value]);
    };
    const result=module.sample();
    return {result,capturedSource};
  }finally{
    if(previousStorage)Object.defineProperty(globalThis,'Storage',previousStorage);
    else Reflect.deleteProperty(globalThis,'Storage');
    if(previousLocalStorage)Object.defineProperty(globalThis,'localStorage',previousLocalStorage);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
}

test('exported WeakMap host mutation is observed and preserves function source',async()=>{
  const app=compile(exportedWeakMap,'agent1-weakmap-exported-instance-runtime-witness');
  assert.equal(app.metrics.bindings,0,JSON.stringify(app.metrics));
  const native=await runWithSourceCapture(exportedWeakMap);
  const emitted=await runWithSourceCapture(String(app.code));
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource);
  assert.ok(emitted.capturedSource);
  assert.equal(emitted.capturedSource,native.capturedSource,
    JSON.stringify({native,emitted,metrics:app.metrics}));
  process.stdout.write('EXPORTED_WEAKMAP_SOURCE_PRESERVED '+JSON.stringify({
    metrics:app.metrics,native,emitted
  })+'\n');
});


const weakMapPrototypeIdentityWrapper=fixtures.prototypeOverride.replace(
  'const captured=new WeakMap();',
  [
    'const captured=new WeakMap();',
    'const nativeWeakMapSet=WeakMap.prototype.set;',
    'WeakMap.prototype.set=function(key,value){return nativeWeakMapSet.call(this,key,value);};'
  ].join('\n')
);

test('any source-visible WeakMap prototype replacement invalidates reference-only override',()=>{
  const ast=parse(weakMapPrototypeIdentityWrapper,'module');
  assert.equal(observesFunctionSource(ast),true);
  const app=compile(weakMapPrototypeIdentityWrapper,'agent1-weakmap-prototype-identity-wrapper');
  assert.equal(app.metrics.bindings,0,JSON.stringify({metrics:app.metrics,code:app.code}));
});


const globalWeakMapReplacement=fixtures.prototypeOverride.replace(
  'const captured=new WeakMap();',
  [
    'const NativeWeakMap=WeakMap;',
    'globalThis.WeakMap=function(){',
    '  const map=new NativeWeakMap();',
    '  const nativeSet=map.set;',
    '  map.set=function(key,value){return nativeSet.call(this,key,String(value));};',
    '  return map;',
    '};',
    'const captured=new WeakMap();'
  ].join('\n')
);

test('global WeakMap constructor replacement invalidates reference-only override',()=>{
  const ast=parse(globalWeakMapReplacement,'module');
  assert.equal(observesFunctionSource(ast),true);
  const app=compile(globalWeakMapReplacement,'agent1-global-weakmap-replacement');
  assert.equal(app.metrics.bindings,0,JSON.stringify({metrics:app.metrics,code:app.code}));
});
