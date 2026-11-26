'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,hasWeakMapPrototypeExposure}=require('../src/ast');

const patchLines=[
  'const nativeSet=nativePrototype.set;',
  'nativePrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeSet,this,[key,value]);',
  '};'
];

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

function runEsm(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-'));
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

function mutation(prefix,prototypeExpression) {
  return [
    ...prefix,
    'const nativePrototype='+prototypeExpression+';',
    ...patchLines
  ].join('\n');
}

const fixtures=[
  {
    name:'closure-captured-container',
    source:[
      'function outer(){',
      '  const carrier={instance:new WeakMap()};',
      '  function patchWeakMap(){',
      '    const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines.map(line=>'    '+line),
      '  }',
      '  patchWeakMap();',
      '}',
      'outer();'
    ].join('\n')
  },
  {
    name:'throw-catch-parameter',
    source:[
      'try {',
      '  throw new WeakMap();',
      '} catch (instance) {',
      '  const nativePrototype=Object.getPrototypeOf(instance);',
      ...patchLines,
      '}'
    ].join('\n')
  },
  {
    name:'local-class-getter',
    source:[
      'class Carrier {',
      '  get instance(){return new WeakMap();}',
      '}',
      'const carrier=new Carrier();',
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'switch-fallthrough',
    source:[
      'let carrier={};',
      'switch(0){',
      '  case 0:',
      '    carrier={instance:new WeakMap()};',
      '  case 1: {',
      '    const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines.map(line=>'    '+line),
      '    break;',
      '  }',
      '}'
    ].join('\n')
  },
  {
    name:'labeled-block',
    source:[
      'let carrier={};',
      'setup: {carrier={instance:new WeakMap()};}',
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'block-shadow',
    source:[
      'const carrier={instance:new WeakMap()};',
      '{const carrier={};}',
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'try-environment-join',
    source:[
      'let carrier={};',
      'try {carrier={instance:new WeakMap()};} catch {}',
      'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'nested-derived-class-name-collision',
    source:[
      'class Derived extends globalThis.WeakMap {}',
      'function unrelated(){',
      '  class Parent extends globalThis.WeakMap {}',
      '  class Derived extends Parent {}',
      '}',
      'const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'reflect-get-prototype-chain',
    source:[
      'class Derived extends globalThis.WeakMap {}',
      'const derivedPrototype=Reflect.get(Derived,"prototype");',
      'const nativePrototype=Reflect.get(derivedPrototype,"__proto__");',
      ...patchLines
    ].join('\n')
  },
  {
    name:'computed-global-constructor-key',
    source:[
      'const constructorKey="WeakMap";',
      'class Derived extends globalThis[constructorKey] {}',
      'const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
      ...patchLines
    ].join('\n')
  },
  {
    name:'conditional-class-heritage',
    source:[
      'const Base=true?globalThis.WeakMap:Map;',
      'class Derived extends Base {}',
      'const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
      ...patchLines
    ].join('\n')
  }
];

for(const fixture of fixtures) {
  test('WeakMap source-observer differential: '+fixture.name,()=>{
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:fixture.source},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const analysis=hasWeakMapPrototypeExposure(parse(fixture.source,'module'));
    const mutationObserver=observesFunctionSource(parse(fixture.source,'module'));
    const storageObserver=observesFunctionSource(parse(storageSource,'module'));
    const native=runEsm(sourceFiles.map(file=>({path:file.path,code:file.code})));
    assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
    const failures=[];
    for(const mode of ['coo','sno','sco']) {
      try {
        const compiled=obfuscateFiles(sourceFiles,{
          mode,seed:'agent7-'+fixture.name+'-'+mode,
          properties:false,identifiers:true,strings:false,closedWorld:true
        });
        const storage=compiled.files.find(file=>file.path==='storage.mjs');
        assert.ok(storage,'missing storage.mjs for '+mode);
        const emitted=runEsm(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
        if(!analysis || storage.metrics.bindings!==0 ||
           emitted.capturedSource!==native.capturedSource ||
           JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
          failures.push({
            mode,analysis,mutationObserver,storageObserver,
            storageMetrics:storage.metrics,native,emitted
          });
        }
      } catch(error) {
        failures.push({mode,analysis,mutationObserver,storageObserver,error:String(error)});
      }
    }
    assert.deepEqual(failures,[],JSON.stringify({
      fixture:fixture.name,analysis,mutationObserver,storageObserver,native,failures
    }));
  });
}


/**
 * Run a supplied module group while an external consumer imports the exported
 * WeakMap-derived class and mutates its native parent prototype.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runEsmWithExternalDerivedConsumer(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-export-'));
  const externalRunner=[
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
    "const {Derived}=await import('./producer.mjs');",
    'const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
    'const nativeSet=nativePrototype.set;',
    'nativePrototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};',
    "const {sample}=await import('./entry.mjs');",
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
  ].join('\n');
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    fs.writeFileSync(path.join(directory,'external-runner.mjs'),externalRunner,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'external-runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('exported WeakMap-derived class external consumer source-capture differential',()=>{
  const producerSource='export class Derived extends globalThis.WeakMap {}';
  const sourceFiles=[
    {path:'producer.mjs',sourceType:'module',code:producerSource},
    {path:'entry.mjs',sourceType:'module',code:"export {sample} from './storage.mjs';"},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(producerSource,'module'));
  const native=runEsmWithExternalDerivedConsumer(sourceFiles.map(file=>({path:file.path,code:file.code})));
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-exported-derived-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage,'missing storage.mjs for '+mode);
      const emitted=runEsmWithExternalDerivedConsumer(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(!analysis || storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      failures.push({mode,analysis,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures}));
});


/**
 * Run a supplied module group while an external consumer calls an exported
 * ESM factory to obtain a WeakMap and mutates its native prototype.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runEsmWithExternalFactoryConsumer(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-esm-factory-'));
  const externalRunner=[
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
    "const {make}=await import('./producer.mjs');",
    'const nativePrototype=Object.getPrototypeOf(make());',
    'const nativeSet=nativePrototype.set;',
    'nativePrototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};',
    "const {sample}=await import('./entry.mjs');",
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
  ].join('\n');
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    fs.writeFileSync(path.join(directory,'external-runner.mjs'),externalRunner,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'external-runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('ESM exported WeakMap factory external consumer source-capture remains protected',()=>{
  const producerSource='export function make(){return new WeakMap();}';
  const sourceFiles=[
    {path:'producer.mjs',sourceType:'module',code:producerSource},
    {path:'entry.mjs',sourceType:'module',code:"export {sample} from './storage.mjs';"},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(producerSource,'module'));
  const native=runEsmWithExternalFactoryConsumer(
    sourceFiles.map(file=>({path:file.path,code:file.code}))
  );
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-esm-exported-factory-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage,'missing storage.mjs for '+mode);
      const emitted=runEsmWithExternalFactoryConsumer(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(!analysis || storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      failures.push({mode,analysis,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures}));
});

test('exported WeakMap-derived class is a group escape',()=>{
  const source='export class Derived extends globalThis.WeakMap {}';
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'module')),true);
});


/**
 * Execute the supplied ESM group with an external bare-specifier package that
 * is deliberately not part of the obfuscator input.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runEsmWithExternalImportedFactory(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-esm-import-'));
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    const packageDirectory=path.join(directory,'node_modules','opaque-runtime');
    fs.mkdirSync(packageDirectory,{recursive:true});
    fs.writeFileSync(path.join(packageDirectory,'package.json'),
      JSON.stringify({type:'module',exports:'./index.js'}),'utf8');
    fs.writeFileSync(path.join(packageDirectory,'index.js'),
      'export function make(){return new WeakMap();}','utf8');
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

test('unresolved ESM imported factory external source-capture fails closed',()=>{
  const mutateSource=[
    "import {make} from 'opaque-runtime';",
    'const nativePrototype=Object.getPrototypeOf(make());',
    ...patchLines
  ].join('\n');
  const sourceFiles=[
    {path:'entry.mjs',sourceType:'module',code:"import './mutate.mjs'; export {sample} from './storage.mjs';"},
    {path:'mutate.mjs',sourceType:'module',code:mutateSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(mutateSource,'module'));
  const native=runEsmWithExternalImportedFactory(
    sourceFiles.map(file=>({path:file.path,code:file.code}))
  );
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  const refusals=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-esm-imported-factory-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage,'missing storage.mjs for '+mode);
      const emitted=runEsmWithExternalImportedFactory(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      refusals.push({mode,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures,refusals}));
});

test('unresolved imported factory result is not a definite non-WeakMap value',()=>{
  const source=[
    'import {make} from "opaque-runtime";',
    'const nativePrototype=Object.getPrototypeOf(make());',
    ...patchLines
  ].join('\n');
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'module')),true);
});


/**
 * Run a supplied CommonJS group while an external consumer imports the
 * exported WeakMap-derived class and mutates its native parent prototype.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runCjsWithExternalDerivedConsumer(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-cjs-'));
  const externalRunner=[
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
    "const Derived=require('./producer.cjs');",
    'const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
    'const nativeSet=nativePrototype.set;',
    'nativePrototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};',
    "const {sample}=require('./entry.cjs');",
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
  ].join('\n');
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    fs.writeFileSync(path.join(directory,'external-runner.cjs'),externalRunner,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'external-runner.cjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('CommonJS exported WeakMap-derived class external consumer source-capture differential',()=>{
  const producerSource='module.exports=class Derived extends globalThis.WeakMap {};';
  const storageSourceCjs=[
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const captured=new WeakMap();',
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{',
    '    ...descriptor,',
    '    value:function(_key,value){captured.set(this,value);}',
    '  });',
    '  localStorage.setItem("storage-prototype-override",inspect);',
    '  return {value:inspect(),independent:independent()};',
    '}',
    'module.exports={sample};'
  ].join('\n');
  const sourceFiles=[
    {path:'producer.cjs',sourceType:'commonjs',code:producerSource},
    {path:'entry.cjs',sourceType:'commonjs',code:"module.exports=require('./storage.cjs');"},
    {path:'storage.cjs',sourceType:'commonjs',code:storageSourceCjs}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(producerSource,'script'));
  const native=runCjsWithExternalDerivedConsumer(
    sourceFiles.map(file=>({path:file.path,code:file.code}))
  );
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-cjs-exported-derived-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.cjs');
      assert.ok(storage,'missing storage.cjs for '+mode);
      const emitted=runCjsWithExternalDerivedConsumer(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(!analysis || storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      failures.push({mode,analysis,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures}));
});


/**
 * Run a supplied CommonJS group while an external consumer calls an exported
 * factory to obtain a WeakMap and mutates its native prototype.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runCjsWithExternalFactoryConsumer(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-cjs-factory-'));
  const externalRunner=[
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
    "const make=require('./producer.cjs');",
    'const nativePrototype=Object.getPrototypeOf(make());',
    'const nativeSet=nativePrototype.set;',
    'nativePrototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeSet,this,[key,value]);',
    '};',
    "const {sample}=require('./entry.cjs');",
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
  ].join('\n');
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    fs.writeFileSync(path.join(directory,'external-runner.cjs'),externalRunner,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'external-runner.cjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('CommonJS exported WeakMap factory external consumer source-capture differential',()=>{
  const producerSource='module.exports=function make(){return new WeakMap();};';
  const storageSourceCjs=[
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const captured=new WeakMap();',
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{',
    '    ...descriptor,',
    '    value:function(_key,value){captured.set(this,value);}',
    '  });',
    '  localStorage.setItem("storage-prototype-override",inspect);',
    '  return {value:inspect(),independent:independent()};',
    '}',
    'module.exports={sample};'
  ].join('\n');
  const sourceFiles=[
    {path:'producer.cjs',sourceType:'commonjs',code:producerSource},
    {path:'entry.cjs',sourceType:'commonjs',code:"module.exports=require('./storage.cjs');"},
    {path:'storage.cjs',sourceType:'commonjs',code:storageSourceCjs}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(producerSource,'script'));
  const native=runCjsWithExternalFactoryConsumer(
    sourceFiles.map(file=>({path:file.path,code:file.code}))
  );
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-cjs-exported-factory-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.cjs');
      assert.ok(storage,'missing storage.cjs for '+mode);
      const emitted=runCjsWithExternalFactoryConsumer(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(!analysis || storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      failures.push({mode,analysis,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures}));
});

test('CommonJS exported WeakMap-derived class is a group escape',()=>{
  const source='module.exports=class Derived extends globalThis.WeakMap {};';
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'script')),true);
});


/**
 * Execute the supplied CommonJS group with an external bare-specifier package
 * that is deliberately not part of the obfuscator input.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runCjsWithExternalRequireFactory(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent7-weakmap-cjs-import-'));
  const externalRunner=[
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
    "const {sample}=require('./entry.cjs');",
    'const result=sample();',
    'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
  ].join('\n');
  try {
    for(const file of files) {
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    const packageDirectory=path.join(directory,'node_modules','opaque-runtime');
    fs.mkdirSync(packageDirectory,{recursive:true});
    fs.writeFileSync(path.join(packageDirectory,'package.json'),
      JSON.stringify({main:'index.cjs'}),'utf8');
    fs.writeFileSync(path.join(packageDirectory,'index.cjs'),
      'module.exports={make:function(){return new WeakMap();}};','utf8');
    fs.writeFileSync(path.join(directory,'external-runner.cjs'),externalRunner,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'external-runner.cjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('unresolved CommonJS require factory external source-capture fails closed',()=>{
  const mutateSource=[
    "const {make}=require('opaque-runtime');",
    'const nativePrototype=Object.getPrototypeOf(make());',
    ...patchLines
  ].join('\n');
  const storageSourceCjs=[
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const captured=new WeakMap();',
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{',
    '    ...descriptor,',
    '    value:function(_key,value){captured.set(this,value);}',
    '  });',
    '  localStorage.setItem("storage-prototype-override",inspect);',
    '  return {value:inspect(),independent:independent()};',
    '}',
    'module.exports={sample};'
  ].join('\n');
  const sourceFiles=[
    {path:'mutate.cjs',sourceType:'commonjs',code:mutateSource},
    {path:'entry.cjs',sourceType:'commonjs',code:"require('./mutate.cjs'); module.exports=require('./storage.cjs');"},
    {path:'storage.cjs',sourceType:'commonjs',code:storageSourceCjs}
  ];
  const analysis=hasWeakMapPrototypeExposure(parse(mutateSource,'script'));
  const native=runCjsWithExternalRequireFactory(
    sourceFiles.map(file=>({path:file.path,code:file.code}))
  );
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const failures=[];
  const refusals=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-cjs-required-factory-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.cjs');
      assert.ok(storage,'missing storage.cjs for '+mode);
      const emitted=runCjsWithExternalRequireFactory(
        compiled.files.map(file=>({path:file.path,code:String(file.code)}))
      );
      if(storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,analysis,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      refusals.push({mode,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({analysis,native,failures,refusals}));
});

test('CommonJS unresolved require factory result is not a definite non-WeakMap value',()=>{
  const source=[
    'const {make}=require("opaque-runtime");',
    'const nativePrototype=Object.getPrototypeOf(make());',
    ...patchLines
  ].join('\n');
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'script')),true);
});

/**
 * Execute ordered classic scripts in one realm, preserving the shared global
 * lexical environment used by browser script elements.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function runClassicScripts(files) {
  let documentTitle='';
  class Storage {
    constructor(){this.data=new Map();}
    setItem(key,value){this.data.set(String(key),String(value));}
  }
  const document={};
  Object.defineProperty(document,'title',{
    get(){return documentTitle;},
    set(value){documentTitle=String(value);}
  });
  const context=vm.createContext({
    Storage,localStorage:new Storage(),document
  });
  for(const file of files) {
    new vm.Script(file.code,{filename:file.path}).runInContext(context);
  }
  return {result:context.result,capturedSource:documentTitle};
}

test('classic-script lexical WeakMap carrier is shared across source units in one realm',()=>{
  const carrierSource='let carrier=new WeakMap();';
  const mutationSource=[
    'const nativePrototype=Object.getPrototypeOf(carrier);',
    ...patchLines
  ].join('\n');
  const storageScriptSource=[
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const captured=new WeakMap();',
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{',
    '    ...descriptor,',
    '    value:function(_key,value){captured.set(this,value);}',
    '  });',
    '  localStorage.setItem("storage-prototype-override",inspect);',
    '  return {value:inspect(),independent:independent()};',
    '}',
    'globalThis.sample=sample;'
  ].join('\n');
  const entryScriptSource='globalThis.result=globalThis.sample();';
  const sourceFiles=[
    {path:'carrier.js',sourceType:'script',code:carrierSource},
    {path:'mutate.js',sourceType:'script',code:mutationSource},
    {path:'storage.js',sourceType:'script',code:storageScriptSource},
    {path:'entry.js',sourceType:'script',code:entryScriptSource}
  ];
  const native=runClassicScripts(sourceFiles.map(file=>({path:file.path,code:file.code})));
  assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
  const analysisA=hasWeakMapPrototypeExposure(parse(carrierSource,'script'));
  const analysisB=hasWeakMapPrototypeExposure(parse(mutationSource,'script'));
  const failures=[];
  for(const mode of ['coo','sno','sco']) {
    try {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent7-classic-script-realm-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.js');
      assert.ok(storage,'missing storage.js for '+mode);
      const emitted=runClassicScripts(compiled.files.map(file=>({path:file.path,code:String(file.code)})));
      if(storage.metrics.bindings!==0 ||
         emitted.capturedSource!==native.capturedSource ||
         JSON.stringify(emitted.result)!==JSON.stringify(native.result)) {
        failures.push({mode,storageMetrics:storage.metrics,native,emitted});
      }
    } catch(error) {
      failures.push({mode,error:String(error)});
    }
  }
  assert.deepEqual(failures,[],JSON.stringify({
    analysisA,analysisB,native,failures
  }));
});
