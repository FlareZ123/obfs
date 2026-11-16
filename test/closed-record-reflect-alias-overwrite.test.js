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
 * @param {string} mutation
 * @returns {ModuleFile[]}
 */
function graph(mutation){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){return {',
      '  keys:Reflect.ownKeys(schema).sort(),',
      '  enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true,',
      '  value:schema[key]',
      '};}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      mutation,
      "const captured=inspectRecord('auditCount').value;",
      'const names=typeof captured==="function" ?',
      "  Object.keys((await captured(\"return import('./state.mjs')\")()).state) : null;",
      'console.log(JSON.stringify([state.secretField,names]));'
    ].join('\n')}
  ];
}

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-visible-reflect-alias-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const preload=path.join(dir,'preload.cjs');
    await atomicWrite(preload,'globalThis.RUNTIME_FACTORY=Function;');
    const child=spawnSync(process.execPath,['--require',preload,path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @type {[string,string,boolean][]} */
const cases=[
  ['clean reflection methods','',false],
  ['mutable alias of Reflect.ownKeys',[
    'const R=Reflect;',
    'const ownKeys=R.ownKeys;',
    'R.ownKeys=function(receiver){',
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return ownKeys(receiver);',
    '};'
  ].join('\n'),true],
  ['mutable alias of Object.getOwnPropertyDescriptor',[
    'const O=Object;',
    'const descriptor=O.getOwnPropertyDescriptor;',
    'O.getOwnPropertyDescriptor=function(receiver,key){',
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return descriptor(receiver,key);',
    '};'
  ].join('\n'),true],
  ['transitive global Reflect alias',[
    'const Root=globalThis;',
    'const R=Root.Reflect;',
    'const next=R;',
    'const native=next.ownKeys;',
    'next.ownKeys=function(receiver){',
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return native(receiver);',
    '};'
  ].join('\n'),true],
  ['global Reflect destructuring',[
    'const Root=globalThis;',
    'const {Reflect:R}=Root;',
    'const native=R.ownKeys;',
    'R.ownKeys=function(receiver){',
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return native(receiver);',
    '};'
  ].join('\n'),true],
  ['Object.defineProperty overwrites ambient Reflect via alias',[
    'const R=Reflect;',
    'const native=R.ownKeys;',
    "Object.defineProperty(R,'ownKeys',{configurable:true,writable:true,value:function(receiver){",
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return native(receiver);',
    '}});'
  ].join('\n'),true],
  ['Reflect.set overwrites ownKeys through alias',[
    'const R=Reflect;',
    'const native=R.ownKeys;',
    "Reflect.set(R,'ownKeys',function(receiver){",
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return native(receiver);',
    '});'
  ].join('\n'),true],
  ['Object.assign overwrites ownKeys through alias',[
    'const R=Reflect;',
    'const native=R.ownKeys;',
    'Object.assign(R,{ownKeys:function(receiver){',
    "  if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
    '    receiver.auditCount=globalThis.RUNTIME_FACTORY;',
    '  }',
    '  return native(receiver);',
    '}});'
  ].join('\n'),true],
  ['unrelated local ownKeys overwrite',[
    'const local={ownKeys(){return 0;}};',
    'local.ownKeys=function(){return 1;};'
  ].join('\n'),false],
  ['benign Reflect alias and unrelated method assignment',[
    'const R=Reflect;',
    'R.localAuditMarker=1;'
  ].join('\n'),false]
];

for(const [label,mutation,hostile] of cases){
  test('closed-record source-visible reflection '+label,async()=>{
    const files=graph(mutation);
    const original=await execute(files);
    assert.equal(original,hostile?'[41,["secretField"]]':'[41,null]');
    const emitted=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'source-visible-alias-overwrite-20261116',
      identifiers:false,strings:false,properties:true
    });
    assert.equal(emitted.crossFile.properties,hostile?0:1,
      'Visible aliases that replace ambient reflection must block closed-world owner renaming');
    assert.equal(await execute(emitted.files),original);
  });
}
