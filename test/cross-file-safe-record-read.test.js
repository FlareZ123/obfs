'use strict';

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
 * Execute real Node ESM in a fresh loader, preserving the exact output.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} [withHost]
 * @returns {Promise<string>}
 */
async function execute(files,withHost=false) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-verified-record-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'host.cjs');
    if(withHost)await atomicWrite(preloader,'globalThis.RUNTIME_FACTORY=Function;');
    const args=withHost ? ['--require',preloader,path.join(directory,'entry.mjs')] :
      [path.join(directory,'entry.mjs')];
    const child=spawnSync(process.execPath,args,{
      encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} caller
 * @param {string} [extraRecordStatement]
 * @returns {ModuleFile[]}
 */
function graph(caller,extraRecordStatement='') {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      extraRecordStatement,
      'export function inspectRecord(key){',
      '  return {',
      '    keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '  };',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      caller,
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\n')}
  ];
}

for(const [label,caller,mutation,expected] of /** @type {[string,string,string,number][]} */ ([
  ['closed direct own-key calls',
    "const result=[inspectRecord('externalFormat'),inspectRecord('auditCount')];",'',1],
  ['missing inherited key remains unproved',
    "const result=[inspectRecord('externalFormat'),inspectRecord('noSuchField')];",'',0],
  ['inherited constructor is never assumed inert',
    "const result=inspectRecord('constructor');",'',0],
  ['dynamic argument blocks closed-call proof',
    "const key=['external','Format'].join('');const result=inspectRecord(key);",'',0],
  ['exported function alias blocks closed-call proof',
    "const read=inspectRecord;const result=read('externalFormat');",'',0],
  ['mutable private record blocks receiver proof',
    "const result=inspectRecord('externalFormat');",
    "schema.externalFormat='changed';",0]
])) {
  test('cross-file private record '+label,async()=>{
    const files=graph(caller,mutation);
    const native=await execute(files);
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'verified-record-20261116',
      identifiers:false,strings:false,properties:true
    });
    assert.equal(compiled.crossFile.properties,expected,label);
    assert.equal(await execute(compiled.files),native,label);
  });
}

test('host-provided Function through an inherited missing record key still declines',async()=>{
  const files=graph([
    'Object.prototype.noSuchField=globalThis.RUNTIME_FACTORY;',
    "const ctor=inspectRecord('noSuchField').value;",
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    'const result=[Object.keys(remote.state),remote.state.secretField];'
  ].join('\n'));
  const native=await execute(files,true);
  assert.equal(native,'[41,[[\"secretField\"],41]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'host-injected-constructor',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0,
    'An inherited host capability can dynamically import a private owner');
  assert.equal(await execute(compiled.files,true),native);
});

test('aliased Reflect.ownKeys mutation cannot smuggle a host Function loader',async()=>{
  const files=graph([
    "const ctor=inspectRecord('auditCount').keys[0];",
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    'const result=[Object.keys(remote.state),remote.state.secretField];'
  ].join('\n'),
    'const reflection=Reflect;reflection.ownKeys=()=>[globalThis.RUNTIME_FACTORY];');
  const native=await execute(files,true);
  assert.equal(native,'[41,[["secretField"],41]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'aliased-reflect-loader-20261116',
    identifiers:false,strings:false,properties:true
  });
  const delivered=await execute(compiled.files,true);
  assert.equal(delivered,native,
    'A source-declared Reflect alias must not expose renamed owner keys to a runtime loader');
  assert.equal(compiled.crossFile.properties,0,
    'The aliased intrinsic can return an untracked runtime Function constructor');
});

test('computed global Reflect alias cannot expose renamed owner keys',async()=>{
  const files=graph([
    "const ctor=inspectRecord('auditCount').keys[0];",
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    'const result=[Object.keys(remote.state),remote.state.secretField];'
  ].join('\n'),
    "const intrinsic='Reflect';const reflection=globalThis[intrinsic];"+
    'reflection.ownKeys=()=>[globalThis.RUNTIME_FACTORY];');
  const native=await execute(files,true);
  assert.equal(native,'[41,[["secretField"],41]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'computed-reflect-loader-20261116',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(compiled.files,true),native);
  assert.equal(compiled.crossFile.properties,0);
});

test('host-provided global callable cannot be assumed loader-inert',async()=>{
  const files=graph([
    'const ctor=globalThis.RUNTIME_FACTORY;',
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
  ].join('\n'));
  const native=await execute(files,true);
  assert.equal(native,'[41,[3,["secretField"],41]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'host-global-factory-20261116',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(compiled.files,true),native);
  assert.equal(compiled.crossFile.properties,0,
    'A host-provided global callable may implement a dynamic import loader');
});

for(const [label,setup,invoke] of [
  ['direct global method','','globalThis.RUNTIME_FACTORY'],
  ['transitive callable alias',
    'const first=globalThis.RUNTIME_FACTORY;const ctor=first;','ctor']
]) {
  test('host-provided loader via '+label+' cannot evade the record proof',async()=>{
    const files=graph([
      setup,
      "const remote=await "+invoke+"(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-loader-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native);
    assert.equal(compiled.crossFile.properties,0);
  });
}

for(const [label,setup] of [
  ['global object alias','const root=globalThis;const ctor=root.RUNTIME_FACTORY;'],
  ['global destructuring','const {RUNTIME_FACTORY:ctor}=globalThis;'],
  ['global property descriptor',
    'const ctor=Object.getOwnPropertyDescriptor(globalThis,"RUNTIME_FACTORY").value;']
]) {
  test('host loader via '+label+' cannot observe renamed ESM owner',async()=>{
    const files=graph([
      setup,
      "const remote=await ctor(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-loader-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native);
    assert.equal(compiled.crossFile.properties,0);
  });
}

for(const [label,setup] of [
  ['object-literal host capability',
    'const holder={ctor:globalThis.RUNTIME_FACTORY};const ctor=holder.ctor;'],
  ['array host capability',
    'const holder=[globalThis.RUNTIME_FACTORY];const ctor=holder[0];']
]) {
  test('host loader via '+label+' must preserve ESM owner reflection',async()=>{
    const files=graph([
      setup,
      "const remote=await ctor(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-container-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native);
    assert.equal(compiled.crossFile.properties,0);
  });
}

for(const crossModule of [false,true]) {
  test('host callable returned '+(crossModule?'across an ESM module':'from a local function')+
      ' must not authorize renaming an observed owner',async()=>{
    const files=graph([
      crossModule?"import {getFactory} from './factory.mjs';":
        'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
      'const ctor=getFactory();',
      "const remote=await ctor(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    if(crossModule)files.push({path:'factory.mjs',sourceType:'module',
      code:'export function getFactory(){return globalThis.RUNTIME_FACTORY;}'});
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:crossModule?'cross-module-host-return':'local-host-return',
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native);
    assert.equal(compiled.crossFile.properties,0,
      'Opaque host capabilities returned by function calls may dynamically import published ESM modules');
  });
}

test('host-return aliases and implicit arrows preserve original ESM owner keys',async()=>{
  for(const [label,helper] of [
    ['aliased callable','function getFactory(){const f=globalThis.RUNTIME_FACTORY;return f;}'],
    ['implicit arrow','const getFactory=()=>globalThis.RUNTIME_FACTORY;'],
    ['returned holder','function getFactory(){return {ctor:globalThis.RUNTIME_FACTORY};}']
  ]) {
    const held=label==='returned holder';
    const files=graph([
      helper,
      held?'const ctor=getFactory().ctor;':'const ctor=getFactory();',
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n',label);
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-return-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(compiled.crossFile.properties,0,label);
    assert.equal(await execute(compiled.files,true),native,label);
  }
});

test('unrelated local primitive-return helper keeps private record transformation',async()=>{
  const files=graph([
    'function literal(){return 7;}',
    "const result=[inspectRecord('externalFormat'),inspectRecord('auditCount'),literal()];"
  ].join('\n'));
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'safe-primitive-return-control',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  assert.equal(await execute(compiled.files),native);
});

for(const [label,setup,factorySource] of [
  ['awaited factory result',[
    'async function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const ctor=await getFactory();'
  ].join('\n'),null],
  ['destructured factory holder',[
    'function getFactory(){return {ctor:globalThis.RUNTIME_FACTORY};}',
    'const {ctor}=getFactory();'
  ].join('\n'),null],
  ['ESM namespace-imported factory',[
    "import * as factories from './factory.mjs';",
    'const ctor=factories.getFactory();'
  ].join('\n'),'export function getFactory(){return globalThis.RUNTIME_FACTORY;}'],
  ['local forwarding wrapper',[
    'function inner(){return globalThis.RUNTIME_FACTORY;}',
    'function getFactory(){return inner();}',
    'const ctor=getFactory();'
  ].join('\n'),null],
  ['local factory alias',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const factory=getFactory;',
    'const ctor=factory();'
  ].join('\n'),null],
  ['separate returned-holder member',[
    'function getFactory(){return {ctor:globalThis.RUNTIME_FACTORY};}',
    'const holder=getFactory();',
    'const ctor=holder.ctor;'
  ].join('\n'),null]
]) {
  test('forwarded host return via '+label+' cannot change distributed owner spelling',async()=>{
    const files=graph([
      setup,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    if(factorySource)files.push({path:'factory.mjs',sourceType:'module',code:factorySource});
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n',label);
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-return-next-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(compiled.files,true),native,label);
    assert.equal(compiled.crossFile.properties,0,label);
  });
}


/**
 * Native invocation adapters can call a host-bearing factory while its
 * returned Function escapes through the call result. A static direct-callee
 * proof must reject such unknown runtime loader paths. The ordinary
 * direct-call positive in this file remains the non-vacuity control.
 */
for(const [label,setup] of /** @type {[string,string][]} */ ([
  ['function call adapter',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=getFactory.call(null);'],
  ['function apply adapter',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=getFactory.apply(null,[]);'],
  ['Reflect apply adapter',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=Reflect.apply(getFactory,null,[]);'],
  ['bound function adapter',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const bound=getFactory.bind(null);const ctor=bound();'],
  ['aliased call adapter',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const factory=getFactory;const ctor=factory.call(null);'],
  ['direct bound invocation',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=getFactory.bind(null)();'],
  ['new factory invocation',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=new getFactory();'],
  ['Reflect construct factory',
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}'+
    'const ctor=Reflect.construct(getFactory,[]);']
])) {
  test('host factory '+label+' preserves native published owner keys',async()=>{
    const files=graph([
      setup,
      'const remote=await ctor("return import(\'./state.mjs\')")();',
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n',label);
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-factory-adapter-'+label,
      identifiers:false,strings:false,properties:true
    });
    const delivered=await execute(compiled.files,true);
    assert.equal(delivered,native,label);
    assert.equal(compiled.crossFile.properties,0,label);
  });
}

test('non-host primitive adapter preserves proven private-field rewrite',async()=>{
  const files=graph([
    'function primitive(){return 7;}',
    'const value=primitive.call(null);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'primitive-adapter-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'Benign primitive return must not globally disable private-property renaming');
  assert.equal(await execute(compiled.files),native);
});


test('getter-returned Reflect alias cannot expose renamed cross-file owner keys',async()=>{
  const files=graph([
    'const ambient={get reflect(){return globalThis.Reflect;}};',
    'const reflector=ambient.reflect;',
    'const originalOwnKeys=reflector.ownKeys;',
    'let observed=[];',
    'reflector.ownKeys=function(value){',
    '  const keys=originalOwnKeys.call(this,value);',
    '  observed=originalOwnKeys.call(reflector,state).sort();',
    '  return keys;',
    '};',
    "const result=[inspectRecord('externalFormat'),observed];"
  ].join('\n'));
  const native=await execute(files);
  assert.equal(native,'[41,[{"keys":["auditCount","externalFormat"],"value":"audit-v1","enumerable":true},["secretField"]]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'getter-returned-reflect-observer',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0,
    'A getter-returned host Reflect alias can observe owner property names');
  assert.equal(await execute(compiled.files),native,
    'A getter-returned Reflect alias must not observe renamed cross-file owner keys');
});
