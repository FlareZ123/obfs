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
    ].join('\\n')
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

test('exported WeakMap-derived class is a group escape',()=>{
  const source='export class Derived extends globalThis.WeakMap {}';
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'module')),true);
});

test('unresolved imported factory result is not a definite non-WeakMap value',()=>{
  const source=[
    'import {make} from "opaque-runtime";',
    'const nativePrototype=Object.getPrototypeOf(make());',
    ...patchLines
  ].join('\n');
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'module')),true);
});

test('CommonJS exported WeakMap-derived class is a group escape',()=>{
  const source='module.exports=class Derived extends globalThis.WeakMap {};';
  assert.equal(hasWeakMapPrototypeExposure(parse(source,'script')),true);
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
