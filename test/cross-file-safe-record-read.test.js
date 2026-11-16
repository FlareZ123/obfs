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
