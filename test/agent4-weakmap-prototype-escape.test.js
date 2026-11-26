'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const source=[
  'const weakMapPrototype=Object.getPrototypeOf(new WeakMap());',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};',
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\\n');

/**
 * Run a module with a DOMString-compatible Document.createTextNode host shim.
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
  ].join('\\n');
  const url='data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64');
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,url],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(child.status,0,child.stderr||child.error?.message);
  return /** @type {{result:{value:number,independent:number},capturedSource:string|null}} */(
    JSON.parse(child.stdout)
  );
}

test('WeakMap prototype mutation through Object.getPrototypeOf misses Storage source-observer proof',()=>{
  const ast=parse(source,'module');
  const observed=observesFunctionSource(ast);
  assert.equal(observed,false,
    'the reference-only Storage proof should expose its current blind spot');

  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'agent4-weakmap-prototype-escape-review',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  assert.ok(app.metrics.bindings>=2,
    JSON.stringify({metrics:app.metrics,code:app.code}));

  const native=run(source);
  const emitted=run(String(app.code));
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource?.includes('privateLocal'),
    JSON.stringify(native));
  assert.ok(emitted.capturedSource);
  assert.ok(!emitted.capturedSource.includes('privateLocal'),
    JSON.stringify({native,emitted,metrics:app.metrics}));
  assert.notEqual(emitted.capturedSource,native.capturedSource);
  process.stdout.write('WEAKMAP_PROTOTYPE_ESCAPE_FALSE_SAFE '+JSON.stringify({
    observed,metrics:app.metrics,native,emitted
  })+'\\n');
});
