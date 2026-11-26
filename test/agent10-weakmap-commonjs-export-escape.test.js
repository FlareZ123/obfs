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
  'if(!descriptor||typeof descriptor.value!=="function")throw new Error("Storage.setItem descriptor unavailable");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'exports.sample=function(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){',
  '      captured.set(this,value);',
  '      return Reflect.apply(descriptor.value,this,[_key,String(value)]);',
  '    }',
  '  });',
  '  localStorage.setItem("agent10-commonjs-weakmap",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '};'
].join('\n');

const entrySource=[
  "require('./mutate.cjs');",
  "module.exports=require('./storage.cjs');"
].join('\n');

const runnerSource=[
  'class Storage{constructor(){this.values=new Map();}setItem(key,value){this.values.set(String(key),String(value));}}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'globalThis.document={title:"initial"};',
  'const {sample}=require(process.argv[1]);',
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
].join('\n');

/**
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent10-commonjs-weakmap-'));
  try {
    for(const file of files) {
      const target=path.join(directory,file.path);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,file.code);
    }
    const child=spawnSync(process.execPath,[
      '-e',runnerSource,path.join(directory,'entry.cjs')
    ],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr||child.stdout);
    return /** @type {{result:{value:number,independent:number},capturedSource:string}} */(
      JSON.parse(child.stdout)
    );
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} factorySource
 * @param {string} mutateSource
 * @param {string} seed
 */
function verify(factorySource,mutateSource,seed) {
  const sourceFiles=[
    {path:'entry.cjs',sourceType:'commonjs',code:entrySource},
    {path:'factory.cjs',sourceType:'commonjs',code:factorySource},
    {path:'mutate.cjs',sourceType:'commonjs',code:mutateSource},
    {path:'storage.cjs',sourceType:'commonjs',code:storageSource}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'coo',seed,properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.cjs');
  assert.ok(storage);
  assert.equal(storage.metrics.bindings,0,
    JSON.stringify({seed,metrics:storage.metrics,files:compiled.files.map(file=>({path:file.path,metrics:file.metrics}))}));
  const native=run(sourceFiles.map(file=>({path:file.path,code:file.code})));
  const emitted=run(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
  assert.deepEqual(emitted.result,native.result);
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify({seed,native}));
  assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify({seed,native,emitted}));
  return {seed,metrics:storage.metrics,native,emitted};
}

test('CommonJS module.exports instance is a group WeakMap escape',()=>{
  const mutateSource=[
    "const {probeMap}=require('./factory.cjs');",
    'const prototype=Object.getPrototypeOf(probeMap);',
    'const nativeSet=prototype.set;',
    'prototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};'
  ].join('\n');
  const result=verify(
    'const probeMap=new WeakMap();module.exports={probeMap};',
    mutateSource,
    'agent10-commonjs-exported-weakmap-instance'
  );
  process.stdout.write('COMMONJS_EXPORTED_WEAKMAP_INSTANCE_REFUSED '+JSON.stringify(result)+'\n');
});

test('CommonJS exports factory returning a WeakMap is a group escape',()=>{
  const mutateSource=[
    "const {makeMap}=require('./factory.cjs');",
    'const probeMap=makeMap();',
    'const prototype=Object.getPrototypeOf(probeMap);',
    'const nativeSet=prototype.set;',
    'prototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};'
  ].join('\n');
  const result=verify(
    'exports.makeMap=function(){return new WeakMap();};',
    mutateSource,
    'agent10-commonjs-exported-weakmap-factory'
  );
  process.stdout.write('COMMONJS_EXPORTED_WEAKMAP_FACTORY_REFUSED '+JSON.stringify(result)+'\n');
});
