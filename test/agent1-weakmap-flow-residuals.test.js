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


test('WeakMap-derived prototype parent extraction aliases must invalidate the cross-file Storage proof',()=>{
  const variants=[
    {
      name:'non-shadowing derived class via Object.getPrototypeOf',
      code:[
        'class LocalMap extends globalThis.WeakMap {}',
        'const nativeWeakMapPrototype=Object.getPrototypeOf(LocalMap.prototype);',
        'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
        'nativeWeakMapPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
        '};'
      ].join('\n')
    },
    {
      name:'shadowed derived class via __proto__',
      code:[
        'class WeakMap extends globalThis.WeakMap {}',
        'const nativeWeakMapPrototype=WeakMap.prototype.__proto__;',
        'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
        'nativeWeakMapPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
        '};'
      ].join('\n')
    },
    {
      name:'shadowed derived class via aliased Reflect.getPrototypeOf',
      code:[
        'class WeakMap extends globalThis.WeakMap {}',
        'const getPrototype=Reflect.getPrototypeOf;',
        'const nativeWeakMapPrototype=getPrototype(WeakMap.prototype);',
        'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
        'nativeWeakMapPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
        '};'
      ].join('\n')
    },
    {
      name:'shadowed derived class via aliased Object.getPrototypeOf',
      code:[
        'class WeakMap extends globalThis.WeakMap {}',
        'const getPrototype=Object.getPrototypeOf;',
        'const nativeWeakMapPrototype=getPrototype(WeakMap.prototype);',
        'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
        'nativeWeakMapPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
        '};'
      ].join('\n')
    },
    {
      name:'two-level derived class prototype chain',
      code:[
        'class ParentMap extends globalThis.WeakMap {}',
        'class WeakMap extends ParentMap {}',
        'const parentPrototype=Object.getPrototypeOf(WeakMap.prototype);',
        'const nativeWeakMapPrototype=Object.getPrototypeOf(parentPrototype);',
        'const nativeWeakMapSet=nativeWeakMapPrototype.set;',
        'nativeWeakMapPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
        '};'
      ].join('\n')
    }
  ];
  const evidence=[];
  for(const mode of ['coo','sco','sno']) {
    for(const variant of variants) {
    const mutationAst=parse(variant.code,'module');
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:variant.code},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const compiled=obfuscateFiles(sourceFiles,{
      mode,seed:'agent6-weakmap-parent-variant-'+mode+'-'+variant.name,
      properties:false,identifiers:true,strings:false,closedWorld:true
    });
    const storage=compiled.files.find(file=>file.path==='storage.mjs');
    assert.ok(storage);
    const native=run(sourceFiles);
    const emitted=run(compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    assert.deepEqual(emitted.result,native.result,variant.name);
    assert.ok(native.capturedSource.includes('privateLocal'),variant.name);
    evidence.push({
      mode,
      name:variant.name,
      localObserver:observesFunctionSource(mutationAst),
      groupExposure:hasWeakMapPrototypeExposure(mutationAst),
      bindings:storage.metrics.bindings,
      nativeSource:native.capturedSource,
      emittedSource:emitted.capturedSource
    });
    }
  }
  process.stdout.write('WEAKMAP_PARENT_PROTOTYPE_VARIANTS '+JSON.stringify(evidence)+'\\n');
  assert.ok(evidence.every(item=>
    !item.localObserver&&item.groupExposure&&item.bindings===0&&
    item.emittedSource===item.nativeSource
  ),JSON.stringify(evidence));
});


test('derived prototype traversal that stops before native WeakMap.prototype remains local',()=>{
  const controls=[
    {
      name:'own subclass prototype only',
      code:[
        'class WeakMap extends globalThis.WeakMap {}',
        'const isolatedPrototype=Object.getPrototypeOf(new WeakMap());',
        'const originalSet=isolatedPrototype.set;',
        'isolatedPrototype.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(originalSet,this,[key,value]);',
        '};'
      ].join('\n')
    },
    {
      name:'intermediate parent prototype only',
      code:[
        'class ParentMap extends globalThis.WeakMap {}',
        'class ChildMap extends ParentMap {}',
        'const intermediate=Object.getPrototypeOf(ChildMap.prototype);',
        'const originalSet=intermediate.set;',
        'intermediate.set=function(key,value){',
        '  document.title=value;',
        '  return Reflect.apply(originalSet,this,[key,value]);',
        '};'
      ].join('\n')
    }
  ];
  const evidence=[];
  for(const mode of ['coo','sco','sno']) {
    for(const control of controls) {
      const mutationAst=parse(control.code,'module');
      const sourceFiles=[
        {path:'entry.mjs',sourceType:'module',code:entrySource},
        {path:'mutate.mjs',sourceType:'module',code:control.code},
        {path:'storage.mjs',sourceType:'module',code:storageSource}
      ];
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent6-weakmap-parent-negative-'+mode+'-'+control.name,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage);
      const native=run(sourceFiles);
      const emitted=run(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.deepEqual(emitted.result,native.result,control.name+' '+mode);
      evidence.push({
        mode,name:control.name,
        localObserver:observesFunctionSource(mutationAst),
        groupExposure:hasWeakMapPrototypeExposure(mutationAst),
        bindings:storage.metrics.bindings,
        nativeSource:native.capturedSource,
        emittedSource:emitted.capturedSource
      });
    }
  }
  process.stdout.write('WEAKMAP_PARENT_PROTOTYPE_NEGATIVE_CONTROLS '+JSON.stringify(evidence)+'\\n');
  assert.ok(evidence.every(item=>
    !item.localObserver&&!item.groupExposure&&item.bindings>0&&
    item.emittedSource===item.nativeSource
  ),JSON.stringify(evidence));
});


const carrierResidualVariants = [
  {
    name: 'dynamic-array-index',
    code: [
      'const protoCarrier=[new WeakMap(),{}];',
      'const index=Math.random()<2?0:1;',
      'const selected=protoCarrier[index];',
      'const weakMapPrototype=Object.getPrototypeOf(selected);',
      'const nativeWeakMapSet=weakMapPrototype.set;',
      'weakMapPrototype.set=function(key,value){',
      '  document.title=value;',
      '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
      '};'
    ].join('\n')
  },
  {
    name: 'class-static-field-alias',
    code: [
      'class Carrier { static instance = new WeakMap(); }',
      'const protoCarrier=Carrier;',
      'const weakMapPrototype=Object.getPrototypeOf(protoCarrier.instance);',
      'const nativeWeakMapSet=weakMapPrototype.set;',
      'weakMapPrototype.set=function(key,value){',
      '  document.title=value;',
      '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
      '};'
    ].join('\n')
  },
  {
    name: 'class-static-block-alias',
    code: [
      'class Carrier { static { this.instance = new WeakMap(); } }',
      'const protoCarrier=Carrier;',
      'const weakMapPrototype=Object.getPrototypeOf(protoCarrier.instance);',
      'const nativeWeakMapSet=weakMapPrototype.set;',
      'weakMapPrototype.set=function(key,value){',
      '  document.title=value;',
      '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
      '};'
    ].join('\n')
  }
];

for (const variant of carrierResidualVariants) {
  test('WeakMap carrier residual is detected across the supplied module group: ' + variant.name, () => {
    const mutationAst=parse(variant.code,'module');
    const groupExposure=hasWeakMapPrototypeExposure(mutationAst);
    assert.equal(groupExposure,true,variant.name);
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:variant.code},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent1-weakmap-carrier-residual-'+mode+'-'+variant.name,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage);
      const native=run(sourceFiles);
      const emitted=run(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.equal(storage.metrics.bindings,0,JSON.stringify({
        mode,variant:variant.name,metrics:storage.metrics,native,emitted
      }));
      assert.deepEqual(emitted.result,native.result);
      assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
      assert.equal(emitted.capturedSource,native.capturedSource,JSON.stringify({
        mode,variant:variant.name,native,emitted
      }));
    }
  });
}

const {fixtures}=require('./storage-value-coercion-fixtures');

test('a private WeakMap passed only to a known local reader does not expose its prototype',()=>{
  const source=fixtures.prototypeOverride.replace(
    'const captured=new WeakMap();',
    [
      'const privateMap=new WeakMap();',
      'function consume(map){return map.get("key");}',
      'consume(privateMap);',
      'const captured=new WeakMap();'
    ].join('\n')
  );
  const observed=observesFunctionSource(parse(source,'module'));
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'agent1-private-weakmap-local-reader-precision',
    properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  const evidence={observed,metrics:app.metrics,code:app.code};
  assert.equal(observed,false,JSON.stringify(evidence));
  assert.ok(app.metrics.bindings>=2,JSON.stringify(evidence));
  assert.ok(!String(app.code).includes('privateLocal'),JSON.stringify(evidence));
  assert.ok(!String(app.code).includes('independentLocal'),JSON.stringify(evidence));
});

test('an identity helper remains an escape rather than inheriting the reader exemption',()=>{
  const source=fixtures.prototypeOverride.replace(
    'const captured=new WeakMap();',
    [
      'const privateMap=new WeakMap();',
      'function identity(map){return map;}',
      'const alias=identity(privateMap);',
      'Object.getPrototypeOf(alias);',
      'const captured=new WeakMap();'
    ].join('\n')
  );
  assert.equal(observesFunctionSource(parse(source,'module')),true);
});
