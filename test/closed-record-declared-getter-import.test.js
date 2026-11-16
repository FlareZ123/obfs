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
 * Runtime import is reachable through a source-declared accessor on the
 * global object, yet the installed getter module has no static ESM edge to
 * the exported owner. Every served module is in the declared file group.
 * @param {boolean} dynamicGetter
 * @returns {ModuleFile[]}
 */
function graph(dynamicGetter){
  const setup=dynamicGetter ? [
    "Object.defineProperty(globalThis,'TRIGGER',{",
    '  configurable:true,',
    '  get(){',
    "    globalThis.OBSERVED=import('./state.mjs').then(ns=>Object.keys(ns.state));",
    '    return 1;',
    '  }',
    '});'
  ].join('\n') : [
    "Object.defineProperty(globalThis,'TRIGGER',{value:1,configurable:true});",
    "globalThis.OBSERVED=Promise.resolve(['unrelated']);"
  ].join('\n');
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
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
    {path:'setup.mjs',sourceType:'module',code:setup},
    {path:'entry.mjs',sourceType:'module',code:[
      "import './setup.mjs';",
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      "const result=inspectRecord('externalFormat');",
      'const invoked=globalThis.TRIGGER;',
      'const observed=await globalThis.OBSERVED;',
      'console.log(JSON.stringify([state.secretField,result.value,observed,invoked]));'
    ].join('\n')}
  ];
}

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-declared-getter-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

test('declared getter with runtime ESM import must preserve exported own-field spelling',async()=>{
  const original=graph(true);
  const native=await execute(original);
  assert.equal(native,'[41,"audit-v1",["secretField"],1]');
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'declared-getter-runtime-import',
    identifiers:false,strings:false,properties:true
  });
  const delivered=await execute(compiled.files);
  assert.equal(delivered,native,
    'A source-declared getter can dynamically import and inspect the exported owner');
  assert.equal(compiled.crossFile.properties,0,
    'Untracked runtime import from an accessor invalidates closed-world rename proof');
});

test('declared data property without dynamic loader preserves one legitimate rename',async()=>{
  const original=graph(false);
  const native=await execute(original);
  assert.equal(native,'[41,"audit-v1",["unrelated"],1]');
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'declared-inert-getter-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'An inert value descriptor must not erase independently proven owner renaming');
  assert.equal(await execute(compiled.files),native);
});
