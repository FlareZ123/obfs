'use strict';

/**
 * A host callback can acquire a Function capability asynchronously and use
 * that capability to import a published ESM module that the compiler believes
 * to be statically closed. Preserve the actual native output, not merely
 * numeric compiler metadata, whenever this callback channel is present.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * @param {ModuleFile[]} files
 * @param {boolean} [injectHost]
 * @param {boolean} [arrayIteratorHook]
 * @returns {Promise<string>}
 */
async function execute(files,injectHost=false,arrayIteratorHook=false){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-async-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=path.join(root,'preload.cjs');
    if(injectHost)await atomicWrite(preloader,[
      'globalThis.RUNTIME_FACTORY=Function;',
      ...(arrayIteratorHook?[
        'const originalIterator=Array.prototype[Symbol.iterator];',
        'Array.prototype[Symbol.iterator]=function(){',
        '  if(this.length===1 && this[0]===7){',
        '    let iteration=0;',
        '    return {',
        '      next(){return iteration++===0?',
        '        {value:()=>Function,done:false}:{done:true};},',
        '      [Symbol.iterator](){return this;}',
        '    };',
        '  }',
        '  return originalIterator.call(this);',
        '};'
      ]:[])
    ].join('\n'));
    const args=injectHost?['--require',preloader,path.join(root,'entry.mjs')]:
      [path.join(root,'entry.mjs')];
    const processResult=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {string} entry
 * @returns {ModuleFile[]}
 */
function graph(entry){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',
      code:[
        "const schema={externalFormat:'audit-v1',auditCount:3};",
        'export function inspectRecord(key){',
        '  return {keys:Reflect.ownKeys(schema).sort(),',
        '    value:schema[key],',
        '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true};',
        '}'
      ].join('\n')},
    {path:'entry.mjs',sourceType:'module',
      code:[
        "import {state} from './state.mjs';",
        "import {inspectRecord} from './record.mjs';",
        entry,
        'console.log(JSON.stringify([state.secretField,result]));'
      ].join('\n')}
  ];
}

for(const [label,code] of /** @type {[string,string][]} */ ([
  ['inline Promise.then closure',[
    'const task=Promise.resolve().then(()=>globalThis.RUNTIME_FACTORY);',
    'const ctor=await task;'
  ].join('\n')],
  ['named Promise.then callback',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const ctor=await Promise.resolve().then(getFactory);'
  ].join('\n')]
])){
  test('host-provided Function via '+label+' preserves observed ESM keys',async()=>{
    const files=graph([
      code,
      "const remote=await ctor(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'async-host-callback-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}

test('literal-only Promise callback retains the proven own-record rewrite',async()=>{
  const files=graph([
    'const value=await Promise.resolve().then(()=>7);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'async-host-safe-primitive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files),native);
  assert.equal(generated.crossFile.properties,1,
    'Safe literal callback should not force an all-zero property transform');
});


/**
 * Challenge the scope of callback-value provenance without assuming that
 * syntactically direct and imported callbacks cover holder-mediated calls.
 */
for(const [label,setup,extraSource] of /** @type {[string,string,string|null][]} */ ([
  ['inline function-expression callback',
    'const ctor=await Promise.resolve().then(function(){return globalThis.RUNTIME_FACTORY;});',
    null],
  ['imported named callback',[
    "import {getFactory as fetchFactory} from './factory.mjs';",
    'const ctor=await Promise.resolve().then(fetchFactory);'
  ].join('\n'),
    'export function getFactory(){return globalThis.RUNTIME_FACTORY;}'],
  ['local arrow callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const ctor=await Promise.resolve().then(getFactory);'
  ].join('\n'),null],
  ['object-held callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={getFactory};',
    'const ctor=await Promise.resolve().then(holder.getFactory);'
  ].join('\n'),null]
])){
  test('host callable via '+label+' preserves native ESM property names',async()=>{
    const files=graph([
      setup,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    if(extraSource)files.push({path:'factory.mjs',sourceType:'module',code:extraSource});
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-callback-value-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}


/**
 * Higher-order callback references can be routed through differently shaped
 * local objects, arrays, destructuring, and ESM namespace objects.
 * These are concrete graph-complete sources, with an opaque host preloader
 * deliberately outside the compiler's declared input.
 */
for(const [label,setup,extraModule] of /** @type {[string,string,string|null][]} */ ([
  ['array-held named callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder=[getFactory];',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n'),null],
  ['aliased object-held callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={getFactory};const alias=holder;',
    'const ctor=await Promise.resolve().then(alias.getFactory);'
  ].join('\n'),null],
  ['nested object-held callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={inner:{getFactory}};',
    'const ctor=await Promise.resolve().then(holder.inner.getFactory);'
  ].join('\n'),null],
  ['destructured object-held callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={getFactory};',
    'const {getFactory:cb}=holder;',
    'const ctor=await Promise.resolve().then(cb);'
  ].join('\n'),null],
  ['namespace ESM callback',[
    "import * as providers from './factory.mjs';",
    'const ctor=await Promise.resolve().then(providers.getFactory);'
  ].join('\n'),
    'export function getFactory(){return globalThis.RUNTIME_FACTORY;}'],
  ['computed holder key callback',[
    'const getFactory=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={getFactory};',
    "const ctor=await Promise.resolve().then(holder['getFactory']);"
  ].join('\n'),null]
])){
  test('higher-order '+label+' preserves native observed owner',async()=>{
    const files=graph([
      setup,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    if(extraModule)files.push({path:'factory.mjs',sourceType:'module',code:extraModule});
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'higher-order-callback/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native,label);
    assert.equal(compiled.crossFile.properties,0,label);
  });
}

test('object-held primitive-only callback still permits private record rename',async()=>{
  const files=graph([
    'const getNumber=()=>7;',
    'const holder={getNumber};',
    'const value=await Promise.resolve().then(holder.getNumber);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'holder-safe-primitive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(compiled.files),native);
  assert.equal(compiled.crossFile.properties,1,
    'Unrelated primitive callbacks should retain a protected own-field rewrite');
});


test('inert literal object spread keeps useful private record rewrite',async()=>{
  const files=graph([
    // Merely declaring an unused source-visible factory must not poison an
    // unrelated, provably inert literal spread and its Promise argument.
    'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const safe={...{n:7}};',
    'const echoed=await Promise.resolve(safe);',
    "const result=[inspectRecord('externalFormat').value,echoed.n];"
  ].join('\n'));
  const native=await execute(files);
  assert.equal(native,'[41,["audit-v1",7]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'inert-object-spread-yield',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(compiled.files),native);
  assert.equal(compiled.crossFile.properties,1,
    'An inert inline literal spread does not carry the unused host-returning factory');
});


for(const [label,holderSource] of /** @type {[string,string][]} */ ([
  ['object member assignment',[
    'const holder={};',
    'holder.callback=cb;',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n')],
  ['array index assignment',[
    'const holder=[];',
    'holder[0]=cb;',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n')]
])){
  test('mutated '+label+' cannot hide returned host callback',async()=>{
    const files=graph([
      'const cb=()=>globalThis.RUNTIME_FACTORY;',
      holderSource,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-mutable-holder/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native,label);
    assert.equal(compiled.crossFile.properties,0,label);
  });
}


for(const [label,setup] of /** @type {[string,string][]} */ ([
  ['object alias back-propagation',[
    'const holder={};const alias=holder;',
    'alias.callback=cb;',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n')],
  ['array alias back-propagation',[
    'const holder=[];const alias=holder;',
    'alias[0]=cb;',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n')]
])){
  test('mutable host callback via '+label+' preserves ESM key',async()=>{
    const files=graph([
      'const cb=()=>globalThis.RUNTIME_FACTORY;',
      setup,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'mutable-alias/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native,label);
    assert.equal(compiled.crossFile.properties,0,label);
  });
}

test('unrelated primitive holder mutation retains private-field rewrite',async()=>{
  const files=graph([
    'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const cb=()=>7;',
    'const holder={};holder.callback=cb;',
    'const value=await Promise.resolve().then(holder.callback);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'mutable-holder-inert-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(compiled.files),native);
  assert.equal(compiled.crossFile.properties,1,
    'Mutation of an ordinary holder with an unrelated numeric callback is inert');
});


test('array spread honors externally mutable @@iterator callback transfer',async()=>{
  const files=graph([
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const originalIterator=Array.prototype[Symbol.iterator];',
    'Array.prototype[Symbol.iterator]=function*(){yield getFactory;};',
    'const holder=[...[7]];',
    'Array.prototype[Symbol.iterator]=originalIterator;',
    'const ctor=await Promise.resolve().then(holder[0]);',
    'const remote=await ctor("return import(\'./state.mjs\')")();',
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
  ].join('\n'));
  const native=await execute(files,true);
  assert.equal(native,'[41,[3,["secretField"],41]]\n');
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'host-array-iterator-spread',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files,true),native);
  assert.equal(generated.crossFile.properties,0,
    'An array spread executes @@iterator even if its literal elements are inert');
});


test('external host iterator may inject callback into inert-looking array spread',async()=>{
  const files=graph([
    // This factory's existence makes host-return capability a known program
    // possibility, but it is deliberately not invoked on the source path.
    'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const holder=[...[7]];',
    'const ctor=await Promise.resolve().then(holder[0]);',
    'const remote=await ctor("return import(\'./state.mjs\')")();',
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
  ].join('\n'));
  const native=await execute(files,true,true);
  assert.equal(native,'[41,[3,["secretField"],41]]\n');
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'host-preloaded-iterator-spread',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files,true,true),native);
  assert.equal(generated.crossFile.properties,0,
    'An unknown host iterator can replace literal-array spread elements');
});


for(const [label,holderCode] of /** @type {[string,string][]} */ ([
  ['nested object member target',[
    'const carrier={holder:{}};',
    'carrier.holder.cb=getFactory;',
    'const ctor=await Promise.resolve().then(carrier.holder.cb);'
  ].join('\n')],
  ['nested array index target',[
    'const carrier={inner:[]};',
    'carrier.inner[0]=getFactory;',
    'const ctor=await Promise.resolve().then(carrier.inner[0]);'
  ].join('\n')],
  ['aliased nested member target',[
    'const carrier={holder:{}};const alias=carrier.holder;',
    'alias.cb=getFactory;',
    'const ctor=await Promise.resolve().then(carrier.holder.cb);'
  ].join('\n')]
])){
  test('nested mutable '+label+' does not hide host-return callback',async()=>{
    const files=graph([
      'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
      holderCode,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'nested-mutable-holder/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}

test('nested holder of a primitive callback retains its private rewrite',async()=>{
  const files=graph([
    'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const carrier={holder:{}};',
    'carrier.holder.cb=()=>7;',
    'const value=await Promise.resolve().then(carrier.holder.cb);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'nested-mutable-inert-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files),native);
  assert.equal(generated.crossFile.properties,1);
});


for(const [label,source,extra] of /** @type {[string,string,ModuleFile[]][]} */ ([
  ['local wrapper returns callback object',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return {callback:getFactory};}',
    'const holder=makeHolder();',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n'),[]],
  ['local wrapper returns callback array',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return [getFactory];}',
    'const holder=makeHolder();',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n'),[]],
  ['imported wrapper returns callback object',[
    "import {makeHolder} from './host-wrapper.mjs';",
    'const holder=makeHolder();',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n'),[
    {path:'host-wrapper.mjs',sourceType:'module',
      code:[
        'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
        'export function makeHolder(){return {callback:getFactory};}'
      ].join('\n')}
  ]],
  ['imported wrapper returns callback array',[
    "import {makeHolder} from './host-wrapper.mjs';",
    'const holder=makeHolder();',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n'),[
    {path:'host-wrapper.mjs',sourceType:'module',
      code:[
        'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
        'export function makeHolder(){return [getFactory];}'
      ].join('\n')}
  ]]
])){
  test('returned host callback via '+label+' preserves native ESM owner',async()=>{
    const files=[...graph([
      source,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n')),...extra];
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'interprocedural-holder/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}

test('numeric callback returned inside wrapper still permits one private rewrite',async()=>{
  const files=graph([
    'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return {callback:()=>7};}',
    'const holder=makeHolder();',
    'const value=await Promise.resolve().then(holder.callback);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'interprocedural-primitive-holder',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files),native);
  assert.equal(generated.crossFile.properties,1,
    'Unrelated primitive-returned callbacks are not host capabilities');
});


for(const [label,source,extra] of /** @type {[string,string,ModuleFile[]][]} */ ([
  ['namespace-imported callback-container factory',[
    "import * as wrappers from './host-wrapper.mjs';",
    'const holder=wrappers.makeHolder();',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n'),[
    {path:'host-wrapper.mjs',sourceType:'module',
      code:[
        'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
        'export function makeHolder(){return {callback:getFactory};}'
      ].join('\n')}
  ]],
  ['ordinary object-held callback-container factory',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return {callback:getFactory};}',
    'const registry={makeHolder};',
    'const holder=registry.makeHolder();',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n'),[]],
  ['Promise reaction returns callback-container object',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return {callback:getFactory};}',
    'const holder=await Promise.resolve().then(makeHolder);',
    'const ctor=await Promise.resolve().then(holder.callback);'
  ].join('\n'),[]],
  ['Promise reaction returns callback-container array',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'function makeHolder(){return [getFactory];}',
    'const holder=await Promise.resolve().then(makeHolder);',
    'const ctor=await Promise.resolve().then(holder[0]);'
  ].join('\n'),[]]
])){
  test('forwarded wrapper via '+label+' preserves original owner spelling',async()=>{
    const files=[...graph([
      source,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n')),...extra];
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'async-returned-container/'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}
