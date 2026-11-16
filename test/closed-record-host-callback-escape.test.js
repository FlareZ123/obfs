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
 * Force an otherwise proven static owner rename to coexist with an unrelated
 * verified record[key] getter. Only the callback dispatch form changes.
 * @param {string} callback
 * @returns {ModuleFile[]}
 */
function graph(callback){
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
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      "const result=inspectRecord('externalFormat');",
      callback,
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * A host preloader provides callable values that are invoked through benign
 * standard-library callback dispatch rather than as direct ESM AST callees.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} host
 * @returns {Promise<string>}
 */
async function execute(files,host){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-argument-escape-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const argv=[];
    if(host){
      const preload=[
        "'use strict';",
        "const path=require('node:path');",
        "const {pathToFileURL}=require('node:url');",
        'globalThis.HOST_BRIDGE=function(){',
        "  const uri=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
        '  const operation=import(uri).then(ns=>Object.keys(ns.state));',
        '  globalThis.HOST_OBSERVATION=operation;',
        '  return operation;',
        '};',
        'globalThis.HOST_EXECUTOR=function(resolve,reject){',
        '  globalThis.HOST_BRIDGE().then(resolve,reject);',
        '};'
      ].join('\n');
      const preloadPath=path.join(dir,'preload.cjs');
      await atomicWrite(preloadPath,preload);
      argv.push('--require',preloadPath);
    }
    const child=spawnSync(process.execPath,[...argv,path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{await fs.rm(dir,{force:true,recursive:true});}
}

for(const [label,source] of [
  ['queueMicrotask direct argument',
    'queueMicrotask(globalThis.HOST_BRIDGE);'+
    'await Promise.resolve();const observed=await globalThis.HOST_OBSERVATION;'],
  ['Promise.then direct argument',
    'const observed=await Promise.resolve().then(globalThis.HOST_BRIDGE);'],
  ['Promise.then declared alias',
    'const callback=globalThis.HOST_BRIDGE;'+
    'const observed=await Promise.resolve().then(callback);'],
  ['new Promise host executor',
    'const observed=await new Promise(globalThis.HOST_EXECUTOR);']
]){
  test(label+' must refuse unknown host callback escape',async()=>{
    const original=graph(source);
    const native=await execute(original,true);
    assert.equal(native,'[41,"audit-v1",["secretField"]]');
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-argument-'+label,
      strings:false,identifiers:false,properties:true
    });
    assert.equal(compiled.crossFile.properties,0,
      'An opaque host callback may dynamically observe exported ESM own keys');
    assert.equal(await execute(compiled.files,true),native);
  });
}

test('source-owned Promise callback keeps useful closed-owner transformation',async()=>{
  const original=graph('const observed=await Promise.resolve().then(()=>3);');
  const native=await execute(original,false);
  assert.equal(native,'[41,"audit-v1",3]');
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'pure-promise-positive',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  assert.equal(await execute(compiled.files,false),native);
});
