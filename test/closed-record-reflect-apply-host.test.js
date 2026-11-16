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
 * Keep the immutable owner, unrelated computed-reader proof and ESM consumer
 * identical. Only the explicit host-call form changes between cases.
 * @param {string} hostCall
 * @returns {ModuleFile[]}
 */
function graph(hostCall){
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
      hostCall,
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * Host code runs before the ESM graph, outside the closed source list. It
 * provides a callable whose behavior may dynamically load the ESM owner.
 * The caller's invocation of this host capability is source-visible.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} host
 * @returns {Promise<string>}
 */
async function execute(files,host){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-apply-host-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const argv=[];
    if(host){
      const preload=[
        "'use strict';",
        "const path=require('node:path');",
        "const {pathToFileURL}=require('node:url');",
        'globalThis.HOST_BRIDGE=async function(){',
        "  const url=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
        '  const ns=await import(url);',
        '  return Object.keys(ns.state);',
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
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

for(const [label,statement] of [
  ['direct host expression',
    'const observed=await Reflect.apply(globalThis.HOST_BRIDGE,null,[]);'],
  ['declared host alias',
    'const callback=globalThis.HOST_BRIDGE;'+
    'const observed=await Reflect.apply(callback,null,[]);']
]){
  test('Reflect.apply '+label+' invalidates closed ESM owner key proof',async()=>{
    const original=graph(statement);
    const native=await execute(original,true);
    assert.equal(native,'[41,"audit-v1",["secretField"]]');
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'reflect-apply-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(compiled.crossFile.properties,0,
      'Source-visible invocation of opaque host capability may load the owner');
    assert.equal(await execute(compiled.files,true),native);
  });
}

test('native Reflect.apply of an independent pure built-in retains useful owner proof',async()=>{
  const original=graph('const observed=Reflect.apply(Math.max,null,[2,3]);');
  const native=await execute(original,false);
  assert.equal(native,'[41,"audit-v1",3]');
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'reflect-apply-pure-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'An unrelated ordinary built-in call must not refuse the verified owner');
  assert.equal(await execute(compiled.files,false),native);
});
