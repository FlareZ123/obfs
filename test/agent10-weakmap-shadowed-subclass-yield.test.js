'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const unrelatedSource=[
  'class WeakMap extends globalThis.WeakMap {}',
  'const isolatedPrototype=Object.getPrototypeOf(new WeakMap());',
  'isolatedPrototype.set=function(key,value){return value;}'
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
  "import './unrelated.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

const runnerSource=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let documentTitle="initial";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return documentTitle;},',
  '  set(value){documentTitle=String(value);}',
  '});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,title:document.title})+"\\n");'
].join('\n');

/**
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},title:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-shadowed-'));
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

test('a shadowed WeakMap subclass prototype in a sibling file does not invalidate native WeakMap Storage proof',()=>{
  assert.equal(observesFunctionSource(parse(unrelatedSource,'module')),false);
  assert.equal(observesFunctionSource(parse(storageSource,'module')),false);
  const files=[
    {path:'entry.mjs',sourceType:'module',code:entrySource},
    {path:'unrelated.mjs',sourceType:'module',code:unrelatedSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const compiled=obfuscateFiles(files,{
    mode:'coo',seed:'agent4-shadowed-weakmap-subclass-yield',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  assert.ok(storage.metrics.bindings>=2,
    JSON.stringify({storageMetrics:storage.metrics,files:compiled.files.map(file=>({path:file.path,metrics:file.metrics}))}));
  const native=run(files.map(file=>({path:file.path,code:file.code})));
  const emitted=run(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
  assert.deepEqual(emitted.result,native.result);
  assert.equal(emitted.title,native.title);
  process.stdout.write('SHADOWED_WEAKMAP_SUBCLASS_YIELD_PRESERVED '+JSON.stringify({
    storageMetrics:storage.metrics,native,emitted
  })+'\n');
});
