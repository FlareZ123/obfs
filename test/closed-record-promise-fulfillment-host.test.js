'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A promise fulfillment handler receives the actual object reference; a
 * source-only direct-call formal analysis must not regard that reference as
 * disconnected from an ambient global object.
 * @param {string} mutation
 * @returns {ModuleFile[]}
 */
function graph(mutation){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key]};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      mutation,
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * The host preloader is deliberately not supplied to the compiler. It uses a
 * runtime import to observe the owner whose source binding is already loaded.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-promise-host-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      'const original=Reflect.ownKeys;',
      "const importModule=Function('url','return import(url)');",
      'globalThis.HOST_REFLECT=function(subject){',
      "  if(subject?.externalFormat==='audit-v1'){",
      "    const url=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      '    globalThis.HOST_OBSERVATION=importModule(url).then(m=>Object.keys(m.state));',
      '  }',
      '  return original(subject);',
      '};'
    ].join('\n');
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(root,'entry.mjs')],
      {encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const [name,mutation] of [
  ['direct Promise.resolve global root',
    "await Promise.resolve(globalThis).then(root=>{"+
    "const selector=['Ref','lect'].join('');"+
    'root[selector].ownKeys=globalThis.HOST_REFLECT;});'],
  ['named Promise carrier',
    'const carrier=Promise.resolve(globalThis);'+
    "await carrier.then(root=>{const selector=['Ref','lect'].join('');"+
    'root[selector].ownKeys=globalThis.HOST_REFLECT;});']
]){
  test('Promise fulfillment ambient capability: '+name,async()=>{
    const original=graph(mutation);
    const native=await execute(original);
    assert.deepEqual(native,[41,'audit-v1',['secretField']]);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'promise-host/'+name,
      strings:false,identifiers:false,properties:true
    });
    assert.equal(compiled.crossFile.properties,0,
      'A promise fulfillment callback can mutate a native reflection method');
    assert.deepEqual(await execute(compiled.files),native);
  });
}

test('primitive Promise fulfillment retains actual owner-field rename',async()=>{
  const original=graph('await Promise.resolve(7).then(value=>{void value;});');
  const native=await execute(original);
  assert.deepEqual(native,[41,'audit-v1',null]);
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'promise-host/pure',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  assert.deepEqual(await execute(compiled.files),native);
});
