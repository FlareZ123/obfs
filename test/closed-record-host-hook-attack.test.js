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
 * The runtime preloader is deliberately outside the declared ESM bundle.
 * It may replace an ambient Reflect method before the protected graph loads.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithHostHook(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-record-host-hook-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      "const ownKeys=Reflect.ownKeys;",
      "const dynamicImport=Function('uri','return import(uri)');",
      "Reflect.ownKeys=function(receiver){",
      "  if(receiver && receiver.externalFormat==='audit-v1'){",
      "    const target=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      "    globalThis.HOST_OBSERVATION=dynamicImport(target).then(ns=>Object.keys(ns.state));",
      "  }",
      "  return ownKeys(receiver);",
      "};"
    ].join('\n');
    const hookPath=path.join(root,'preload.cjs');
    await atomicWrite(hookPath,preloader);
    const child=spawnSync(process.execPath,['--require',hookPath,path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

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
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

test('external Reflect.ownKeys monkeypatch can observe a renamed ESM owner through a runtime import',async()=>{
  const original=graph();
  const generated=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-hook-mutable-intrinsic',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(generated.crossFile.properties,1,
    'Baseline syntactic proof admits the unrelated local own-key record read');
  const native=JSON.parse(await executeWithHostHook(original));
  const delivered=JSON.parse(await executeWithHostHook(generated.files));
  assert.deepEqual(native,[41,'audit-v1',['secretField']]);
  assert.equal(delivered[0],native[0]);
  assert.equal(delivered[1],native[1]);
  assert.equal(delivered[2].length,1);
  assert.notEqual(delivered[2][0],native[2][0],
    'Outside the declared source graph, an attacker can observe emitted own keys');
});
