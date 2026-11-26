'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const mutateSource=[
  'const weakMapPrototype=Object.getPrototypeOf(new WeakMap());',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
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

/**
 * Execute an ESM entry graph with a DOMString-compatible Document.title host.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-cross-file-'));
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
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

test('a separate imported module can mutate WeakMap.prototype before the Storage proof file executes',()=>{
  assert.equal(observesFunctionSource(parse(mutateSource,'module')),false);
  assert.equal(observesFunctionSource(parse(storageSource,'module')),false);
  const sourceFiles=[
    {path:'entry.mjs',sourceType:'module',code:entrySource},
    {path:'mutate.mjs',sourceType:'module',code:mutateSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'coo',seed:'agent4-weakmap-cross-file-prototype-escape',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  assert.ok(storage.metrics.bindings>=2,
    JSON.stringify({metrics:storage.metrics,files:compiled.files.map(file=>({path:file.path,metrics:file.metrics}))}));
  const native=run(sourceFiles.map(file=>({path:file.path,code:file.code})));
  const emitted=run(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  assert.ok(!emitted.capturedSource.includes('privateLocal'),
    JSON.stringify({native,emitted,storageMetrics:storage.metrics}));
  process.stdout.write('CROSS_FILE_WEAKMAP_PROTOTYPE_ESCAPE_FALSE_SAFE '+JSON.stringify({
    storageMetrics:storage.metrics,native,emitted
  })+'\n');
});
