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
 * @returns {Promise<string>}
 */
async function execute(files,injectHost=false){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-async-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=path.join(root,'preload.cjs');
    if(injectHost)await atomicWrite(preloader,'globalThis.RUNTIME_FACTORY=Function;');
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
