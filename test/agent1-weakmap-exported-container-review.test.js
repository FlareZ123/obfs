'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

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
  'process.stdout.write(JSON.stringify({result,capturedSource:document.title}));'
].join('\n');

/**
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-container-review-'));
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

const mutation=[
  'const weakMapPrototype=Object.getPrototypeOf(PROBE);',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\n');

/** @type {Array<{name:string,factorySource:string,mutatePrefix:string,probe:string,seed:string}>} */
const fixtures=[
  {
    name:'an exported object literal containing a WeakMap must invalidate the group proof',
    factorySource:'export const holder={map:new WeakMap()};',
    mutatePrefix:"import {holder} from './factory.mjs';\nconst probe=holder.map;",
    probe:'probe',
    seed:'agent1-exported-object-literal-weakmap'
  },
  {
    name:'an exported class method returning a WeakMap through a later export must invalidate the group proof',
    factorySource:'class Factory { makeMap(){return new WeakMap();} }\nexport {Factory};',
    mutatePrefix:"import {Factory} from './factory.mjs';\nconst probe=new Factory().makeMap();",
    probe:'probe',
    seed:'agent1-exported-class-method-weakmap'
  },
  {
    name:'an exported object method returning a WeakMap through a later export must invalidate the group proof',
    factorySource:'const factory={makeMap(){return new WeakMap();}};\nexport {factory};',
    mutatePrefix:"import {factory} from './factory.mjs';\nconst probe=factory.makeMap();",
    probe:'probe',
    seed:'agent1-exported-object-method-weakmap'
  },
  {
    name:'a WeakMap assigned to an exported object after initialization must invalidate the group proof',
    factorySource:'const holder={};\nholder.map=new WeakMap();\nexport {holder};',
    mutatePrefix:"import {holder} from './factory.mjs';\nconst probe=holder.map;",
    probe:'probe',
    seed:'agent1-exported-object-property-weakmap'
  },
  {
    name:'a WeakMap published through a global object property must invalidate the group proof',
    factorySource:'globalThis.__obfsWeakMapProbe=new WeakMap();',
    mutatePrefix:'const probe=globalThis.__obfsWeakMapProbe;',
    probe:'probe',
    seed:'agent1-global-object-property-weakmap'
  },
  {
    name:'an exported generator yielding a WeakMap must invalidate the group proof',
    factorySource:'export function* makeMap(){yield new WeakMap();}',
    mutatePrefix:"import {makeMap} from './factory.mjs';\nconst probe=makeMap().next().value;",
    probe:'probe',
    seed:'agent1-exported-generator-weakmap'
  },
  {
    name:'an exported class getter returning a WeakMap through a later export must invalidate the group proof',
    factorySource:'class Factory { get map(){return new WeakMap();} }\nexport {Factory};',
    mutatePrefix:"import {Factory} from './factory.mjs';\nconst probe=new Factory().map;",
    probe:'probe',
    seed:'agent1-exported-class-getter-weakmap'
  }
];

for(const fixture of fixtures) {
  test(fixture.name,()=>{
    const entrySource=[
      "import './factory.mjs';",
      "import './mutate.mjs';",
      "export {sample} from './storage.mjs';"
    ].join('\n');
    const mutateSource=fixture.mutatePrefix+'\n'+mutation.replace('PROBE',fixture.probe);
    const files=[
      {path:'entry.mjs',code:entrySource},
      {path:'factory.mjs',code:fixture.factorySource},
      {path:'mutate.mjs',code:mutateSource},
      {path:'storage.mjs',code:storageSource}
    ];
    const compiled=obfuscateFiles(files.map(file=>({...file,sourceType:'module'})),{
      mode:'coo',seed:fixture.seed,properties:false,identifiers:true,strings:false,closedWorld:true
    });
    const storage=compiled.files.find(file=>file.path==='storage.mjs');
    assert.ok(storage);
    assert.equal(storage.metrics.bindings,0,
      JSON.stringify({seed:fixture.seed,storageMetrics:storage.metrics,
        files:compiled.files.map(file=>({path:file.path,metrics:file.metrics}))}));
    const native=run(files.map(file=>({path:file.path,code:file.code})));
    const emitted=run(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
    assert.deepEqual(emitted.result,native.result);
    assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
    assert.equal(emitted.capturedSource,native.capturedSource,
      JSON.stringify({seed:fixture.seed,native,emitted,storageMetrics:storage.metrics}));
  });
}
