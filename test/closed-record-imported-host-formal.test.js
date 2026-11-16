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
/** @typedef {{label:string,hook:string,importCode:string,call:string}} Case */

/**
 * A statically closed four-module graph. The preloader's dynamic import is
 * supplied by an otherwise unchanged external host during execution.
 * @param {Case} item
 * @returns {ModuleFile[]}
 */
function graph(item){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key]};',
      '}'
    ].join('\n')},
    {path:'hook.mjs',sourceType:'module',code:item.hook},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      item.importCode,
      item.call,
      "const observed=inspectRecord('externalFormat');",
      'const keys=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,observed.value,keys]));'
    ].join('\n')}
  ];
}

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function evaluate(files){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-import-formal-'));
  try{
    for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      'const original=Reflect.ownKeys;',
      "const dynamicImport=Function('url','return import(url)');",
      'globalThis.HOST_REFLECT=function(object){',
      "  if(object?.externalFormat==='audit-v1'){",
      "    const url=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      '    globalThis.HOST_OBSERVATION=dynamicImport(url).then(m=>Object.keys(m.state));',
      '  }',
      '  return original(object);',
      '};'
    ].join('\n');
    const preloadPath=path.join(folder,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const child=spawnSync(process.execPath,[
      '--require',preloadPath,path.join(folder,'entry.mjs')
    ],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */(JSON.parse(child.stdout));
  }finally{await fs.rm(folder,{recursive:true,force:true});}
}

/** @type {Case[]} */
const negative=[
  {
    label:'named imported function receives global root',
    hook:"export function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import {rewire} from './hook.mjs';",
    call:'rewire(globalThis);'
  },
  {
    label:'named import alias receives global root',
    hook:"export function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import {rewire as change} from './hook.mjs';",
    call:'change(globalThis);'
  },
  {
    label:'imported arrow receives destructured formal',
    hook:"export const rewire=({['Ref'+'lect']:cap})=>{cap.ownKeys=globalThis.HOST_REFLECT;};",
    importCode:"import {rewire} from './hook.mjs';",
    call:'rewire(globalThis);'
  },
  {
    label:'default imported function receives global root',
    hook:"export default function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import rewire from './hook.mjs';",
    call:'rewire(globalThis);'
  },
  {
    label:'namespace imported function receives global root',
    hook:"export function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import * as hooks from './hook.mjs';",
    call:'hooks.rewire(globalThis);'
  },
  {
    label:'computed namespace imported function receives global root',
    hook:"export function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import * as hooks from './hook.mjs';",
    call:"hooks['rewire'](globalThis);"
  },
  {
    label:'local exporter exposed under alias receives global root',
    hook:"function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}export {rewire as mutate};",
    importCode:"import {mutate} from './hook.mjs';",
    call:'mutate(globalThis);'
  },
  {
    label:'imported function forwards root to an internal local call',
    hook:"export function pass(root){rewire(root);}function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}",
    importCode:"import {pass} from './hook.mjs';",
    call:'pass(globalThis);'
  }
];

for(const item of negative){
  test('imported host capability: '+item.label,async()=>{
    const original=graph(item);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'import-formal/'+item.label,
      identifiers:false,strings:false,properties:true
    });
    const native=await evaluate(original);
    assert.deepEqual(native,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await evaluate(compiled.files),native,
      'Host mutation transported through imported function must preserve keys');
    assert.equal(compiled.crossFile.properties,0,
      'Unproved ambient imported function effects must refuse unsafe owner rewrite');
  });
}

test('imported harmless root receiver preserves genuine unrelated owner rewrite',async()=>{
  const original=graph({
    label:'positive-unrelated',
    hook:"export function inspect(root){const {['UNRELATED_FIXTURE']:value}=root;void value;}",
    importCode:"import {inspect} from './hook.mjs';",
    call:'inspect(globalThis);'
  });
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'import-formal/positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'Unrelated imported function retains one actually protected field');
  const native=await evaluate(original);
  assert.deepEqual(native,[41,'audit-v1',null]);
  assert.deepEqual(await evaluate(compiled.files),native);
});

test('default imported harmless reader preserves unrelated owner rewrite',async()=>{
  const original=graph({
    label:'positive-default',
    hook:"export default function inspect(root){const {['UNRELATED_FIXTURE']:value}=root;void value;}",
    importCode:"import inspect from './hook.mjs';",
    call:'inspect(globalThis);'
  });
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'import-formal/positive-default',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  const native=await evaluate(original);
  assert.deepEqual(native,[41,'audit-v1',null]);
  assert.deepEqual(await evaluate(compiled.files),native);
});

test('namespace imported harmless reader preserves unrelated owner rewrite',async()=>{
  const original=graph({
    label:'positive-namespace',
    hook:"export function inspect(root){const {['UNRELATED_FIXTURE']:value}=root;void value;}",
    importCode:"import * as hooks from './hook.mjs';",
    call:'hooks.inspect(globalThis);'
  });
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'import-formal/positive-namespace',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  const native=await evaluate(original);
  assert.deepEqual(native,[41,'audit-v1',null]);
  assert.deepEqual(await evaluate(compiled.files),native);
});

test('imported function called with ordinary local record remains renameable',async()=>{
  const original=graph({
    label:'positive-local',
    hook:"export function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=()=>[];}",
    importCode:"import {rewire} from './hook.mjs';",
    call:"rewire({['Ref'+'lect']:{ownKeys:null}});"
  });
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'import-formal/positive-local',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  const native=await evaluate(original);
  assert.deepEqual(native,[41,'audit-v1',null]);
  assert.deepEqual(await evaluate(compiled.files),native);
});
