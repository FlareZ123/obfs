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
      "};"
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
