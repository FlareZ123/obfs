'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,hasWeakMapPrototypeExposure,observesFunctionSource}=require('../src/ast');

/**
 * A subclass's own prototype is not the native WeakMap prototype, but its
 * parent prototype is. This second prototype hop reaches the shared intrinsic.
 */
const shadowedSubclassBasePrototypeMutationSource=[
  'class WeakMap extends globalThis.WeakMap {}',
  'const nativeWeakMapPrototype=Object.getPrototypeOf(WeakMap.prototype);',
  'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
  'nativeWeakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\n');

const storageSource=[
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
].join('\n');

const entrySource=[
  "import './mutate.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

const runnerSource=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let documentTitle="";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return documentTitle;},',
  '  set(value){documentTitle=String(value);}',
  '});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
].join('\n');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Execute the three-file ESM graph with a DOMString-compatible Document.title.
 * @param {Source[]} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-subclass-prototype-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    fs.writeFileSync(path.join(directory,'runner.mjs'),runnerSource,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('Object.getPrototypeOf(shadowed WeakMap.prototype) exposes the shared native prototype across files',()=>{
  const mutationAst=parse(shadowedSubclassBasePrototypeMutationSource,'module');
  const localObserver=observesFunctionSource(mutationAst);
  const groupExposure=hasWeakMapPrototypeExposure(mutationAst);
  const sourceFiles=[
    {path:'entry.mjs',sourceType:'module',code:entrySource},
    {path:'mutate.mjs',sourceType:'module',code:shadowedSubclassBasePrototypeMutationSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'coo',seed:'agent6-shadowed-weakmap-parent-prototype',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  const native=run(sourceFiles);
  const emitted=run(compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  })));
  process.stdout.write('SHADOWED_WEAKMAP_PARENT_PROTOTYPE '+JSON.stringify({
    localObserver,groupExposure,storageMetrics:storage.metrics,native,emitted
  })+'\\n');
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  assert.ok(
    groupExposure&&storage.metrics.bindings===0&&
    emitted.capturedSource===native.capturedSource,
    JSON.stringify({localObserver,groupExposure,storageMetrics:storage.metrics,native,emitted})
  );
});

const namedClassExpressionMutationSource=[
  'const Parent=class WeakMap extends globalThis.WeakMap {};',
  'class Child extends Parent {};',
  'const nativeWeakMapPrototype=Object.getPrototypeOf(Child.prototype);',
  'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
  'nativeWeakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\\n');

test('named class-expression aliases and subclass chains expose the native WeakMap parent prototype',()=>{
  const mutationAst=parse(namedClassExpressionMutationSource,'module');
  const groupExposure=hasWeakMapPrototypeExposure(mutationAst);
  const sourceFiles=[
    {path:'entry.mjs',sourceType:'module',code:entrySource},
    {path:'mutate.mjs',sourceType:'module',code:namedClassExpressionMutationSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'coo',seed:'agent2-named-weakmap-subclass-parent',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  const native=run(sourceFiles);
  const emitted=run(compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  })));
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  assert.ok(groupExposure&&storage.metrics.bindings===0&&
    emitted.capturedSource===native.capturedSource,
    JSON.stringify({groupExposure,storageMetrics:storage.metrics,native,emitted}));
});
