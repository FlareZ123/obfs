'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const source=[
  "const getPrototype=Object.prototype.__lookupGetter__('__proto__');",
  'const weakMapPrototype=getPrototype.call(new WeakMap());',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};',
  "const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');",
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  "  localStorage.setItem('lookupgetter-prototype-override',inspect);",
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

/**
 * Execute a module with Web Storage and Document.title host shims.
 * @param {string} moduleSource
 * @returns {{result:{value:number,independent:number},capturedSource:string|null}}
 */
function run(moduleSource){
  const script=[
    'class Storage {',
    '  setItem(key,value){this.data.set(String(key),String(value));}',
    '  constructor(){this.data=new Map();}',
    '}',
    'globalThis.Storage=Storage;',
    'globalThis.localStorage=new Storage();',
    'let documentTitle="";',
    'globalThis.document={};',
    'Object.defineProperty(globalThis.document,"title",{get(){return documentTitle;},set(value){documentTitle=String(value);}});',
    'const {sample}=await import(process.argv[1]);',
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:globalThis.document.title??null}));'
  ].join('\n');
  const url='data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64');
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,url],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(child.status,0,child.stderr||child.error?.message);
  return /** @type {{result:{value:number,independent:number},capturedSource:string|null}} */(
    JSON.parse(child.stdout)
  );
}

test('Object.prototype.__lookupGetter__ recovers WeakMap.prototype and bypasses the reference-only Storage observer',()=>{
  const ast=parse(source,'module');
  const observed=observesFunctionSource(ast);
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'agent2-weakmap-lookupgetter-audit',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const native=run(source);
  const emitted=run(String(app.code));
  const evidence={
    observed,
    metrics:app.metrics,
    native,
    emitted,
    source:app.code
  };
  assert.equal(observed,true,JSON.stringify(evidence));
  assert.equal(app.metrics.bindings,0,JSON.stringify(evidence));
  assert.deepEqual(emitted.result,native.result);
  assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify(evidence));
  assert.ok(native.capturedSource?.includes('privateLocal'),JSON.stringify(evidence));
});


test('Object.getOwnPropertyDescriptor can recover the legacy WeakMap prototype getter',()=>{
  const candidate=source.replace(
    "Object.prototype.__lookupGetter__('__proto__')",
    "Object.getOwnPropertyDescriptor(Object.prototype,'__proto__').get"
  );
  const ast=parse(candidate,'module');
  const observed=observesFunctionSource(ast);
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:candidate
  }],{
    mode:'coo',seed:'agent2-weakmap-descriptor-getter-audit',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const native=run(candidate);
  const emitted=run(String(app.code));
  const evidence={observed,metrics:app.metrics,native,emitted,source:app.code};
  assert.equal(observed,true,JSON.stringify(evidence));
  assert.equal(app.metrics.bindings,0,JSON.stringify(evidence));
  assert.deepEqual(emitted.result,native.result);
  assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify(evidence));
});


test('Aliased Object.getOwnPropertyDescriptor can recover the WeakMap prototype getter',()=>{
  const candidate=source.replace(
    "Object.prototype.__lookupGetter__('__proto__')",
    "(()=>{const getDescriptor=Object.getOwnPropertyDescriptor;return getDescriptor(Object.prototype,'__proto__').get;})()"
  );
  const ast=parse(candidate,'module');
  const observed=observesFunctionSource(ast);
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:candidate
  }],{
    mode:'coo',seed:'agent2-weakmap-descriptor-alias-audit',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const native=run(candidate);
  const emitted=run(String(app.code));
  const evidence={observed,metrics:app.metrics,native,emitted,source:app.code};
  assert.equal(observed,true,JSON.stringify(evidence));
  assert.equal(app.metrics.bindings,0,JSON.stringify(evidence));
  assert.deepEqual(emitted.result,native.result);
  assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify(evidence));
});

test('Reflect.get can recover Object.prototype.__lookupGetter__ and bypass the WeakMap guard',()=>{
  const candidate=source.replace(
    "Object.prototype.__lookupGetter__('__proto__')",
    "Reflect.get(Object.prototype,'__lookupGetter__').call(Object.prototype,'__proto__')"
  );
  const ast=parse(candidate,'module');
  const observed=observesFunctionSource(ast);
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:candidate
  }],{
    mode:'coo',seed:'agent2-weakmap-reflect-get-audit',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const native=run(candidate);
  const emitted=run(String(app.code));
  const evidence={observed,metrics:app.metrics,native,emitted,source:app.code};
  assert.equal(observed,true,JSON.stringify(evidence));
  assert.equal(app.metrics.bindings,0,JSON.stringify(evidence));
  assert.deepEqual(emitted.result,native.result);
  assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify(evidence));
});
