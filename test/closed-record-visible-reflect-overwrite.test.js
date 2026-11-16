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

/** @returns {ModuleFile[]} */
function graph(){
  return [
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
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
      'Reflect.ownKeys=globalThis.HOST_REFLECT;',
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * Execute with an opaque host-provided callback; the WRITE to the native
 * Reflect method is declared in the entry ESM file being obfuscated.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-declared-reflect-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      "const native=Reflect.ownKeys;",
      "const dynamicImport=Function('uri','return import(uri)');",
      "globalThis.HOST_REFLECT=function(receiver){",
      "  if(receiver && receiver.externalFormat==='audit-v1'){",
      "    const target=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      "    globalThis.HOST_OBSERVATION=dynamicImport(target).then(ns=>Object.keys(ns.state));",
      "  }",
      "  return native(receiver);",
      "};",
      "globalThis.HOST_REPLACED_REFLECT=Object.create(Reflect);",
      "globalThis.HOST_REPLACED_REFLECT.ownKeys=globalThis.HOST_REFLECT;"
    ].join('\n');
    const preloadPath=path.join(dir,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const processResult=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(dir,'entry.mjs')],{
        encoding:'utf8',timeout:15000
      });
    if(processResult.error)throw processResult.error;
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout.trim();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

test('declared Reflect.ownKeys replacement refuses owner rewrite across external runtime import',async()=>{
  const original=graph();
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'declared-reflect-host-callback',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0,
    'An explicit Reflect.ownKeys overwrite must invalidate an assumed native reflection call');
  const expected=await execute(original);
  assert.equal(expected,'[41,"audit-v1",["secretField"]]');
  assert.equal(await execute(compiled.files),expected,
    'The opaque host callback dynamically imports the same exported owner');
});

/**
 * An own-property descriptor write can replace an ambient reflection object
 * without a direct Reflect identifier or Reflect-valued member access in the
 * declared ESM graph. That replacement is visible to the compiled input.
 */
test('declared global Reflect descriptor replacement declines unproved owner rewrite',async()=>{
  const original=graph().map(file=>file.path==='entry.mjs'?{
    ...file,
    code:file.code.replace('Reflect.ownKeys=globalThis.HOST_REFLECT;',
      "Object.defineProperty(globalThis,'Reflect',{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true});")
  }:file);
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'descriptor-replace-reflect-host',
    identifiers:false,strings:false,properties:true
  });
  const expected=await execute(original);
  assert.equal(expected,'[41,"audit-v1",["secretField"]]');
  const observed=await execute(compiled.files);
  assert.equal(observed,expected,
    'Opaque host reflector imports the published ESM owner during declared reflection');
  assert.equal(compiled.crossFile.properties,0,
    'A declared descriptor replacement of global Reflect invalidates assumed native ownKeys');
});

/**
 * Alternate source-visible global binding replacements. All are legal
 * ECMAScript operations and do not require a dynamic code constructor.
 */
for(const [method,write] of [
  ['Object.defineProperties',
    "Object.defineProperties(globalThis,{Reflect:{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true}});"],
  ['Reflect.set',
    "Reflect.set(globalThis,'Reflect',globalThis.HOST_REPLACED_REFLECT);"],
  ['Object.assign',
    "Object.assign(globalThis,{Reflect:globalThis.HOST_REPLACED_REFLECT});"],
  ['captured Object.defineProperty',
    "const define=Object.defineProperty;define(globalThis,'Reflect',{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true});"],
  ['transitively aliased Object.assign',
    "const assign=Object.assign;const alias=assign;alias(globalThis,{Reflect:globalThis.HOST_REPLACED_REFLECT});"],
  ['array-container global root',
    "const roots=[globalThis];Object.defineProperty(roots[0],'Reflect',{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true});"],
  ['object-container global root',
    "const holder={root:globalThis};Object.defineProperty(holder.root,'Reflect',{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true});"]
]) {
  test(`declared ${method} replacement cannot expose renamed owner`,async()=>{
    const original=graph().map(file=>file.path==='entry.mjs'?{
      ...file,code:file.code.replace('Reflect.ownKeys=globalThis.HOST_REFLECT;',write)
    }:file);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'global-mutator-'+method,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.equal(expected,'[41,"audit-v1",["secretField"]]');
    const observed=await execute(compiled.files);
    assert.equal(observed,expected,
      'Declared global mutator must preserve observable own keys under host callback');
    assert.equal(compiled.crossFile.properties,0);
  });
}

test('irrelevant global descriptor write preserves proved own-key transformation',async()=>{
  const original=graph().map(file=>file.path==='entry.mjs'?{
    ...file,code:file.code.replace('Reflect.ownKeys=globalThis.HOST_REFLECT;',
      "Object.defineProperty(globalThis,'UNRELATED_FIXTURE',{value:7,configurable:true});")
  }:file);
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'unrelated-global-mutator',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A statically unrelated global key should not invalidate a native own-key proof');
  const expected=await execute(original);
  assert.equal(expected,'[41,"audit-v1",null]');
  assert.equal(await execute(compiled.files),expected);
});

/**
 * Source-declared reflective descriptor objects can reveal a mutable global
 * intrinsic without spelling that native method as a direct mutation target.
 * This canary intentionally asserts exact native/generated behavior.
 */
test('descriptor-value forwarded global Reflect mutation preserves emitted own keys',async()=>{
  const original=graph().map(file=>file.path==='entry.mjs'?{
    ...file,code:file.code.replace('Reflect.ownKeys=globalThis.HOST_REFLECT;',
      "const d=Object.getOwnPropertyDescriptor(globalThis,'Reflect');d.value.ownKeys=globalThis.HOST_REFLECT;")
  }:file);
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'descriptor-value-forwarded-root',
    identifiers:false,strings:false,properties:true
  });
  const native=await execute(original);
  assert.equal(native,'[41,"audit-v1",["secretField"]]');
  assert.equal(await execute(compiled.files),native,
    'The descriptor value aliases global Reflect and calls the declared host reflector');
  assert.equal(compiled.crossFile.properties,0);
});
