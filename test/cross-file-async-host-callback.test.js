'use strict';

/**
 * A host callback can acquire a Function capability asynchronously and use
 * that capability to import a published ESM module that the compiler believes
 * to be statically closed. Preserve the actual native output, not merely
 * numeric compiler metadata, whenever this callback channel is present.
 */
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
 * @param {ModuleFile[]} files
 * @param {boolean} [injectHost]
 * @returns {Promise<string>}
 */
async function execute(files,injectHost=false){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-async-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=path.join(root,'preload.cjs');
    if(injectHost)await atomicWrite(preloader,'globalThis.RUNTIME_FACTORY=Function;');
    const args=injectHost?['--require',preloader,path.join(root,'entry.mjs')]:
      [path.join(root,'entry.mjs')];
    const processResult=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {string} entry
 * @returns {ModuleFile[]}
 */
function graph(entry){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',
      code:[
        "const schema={externalFormat:'audit-v1',auditCount:3};",
        'export function inspectRecord(key){',
        '  return {keys:Reflect.ownKeys(schema).sort(),',
        '    value:schema[key],',
        '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true};',
        '}'
      ].join('\n')},
    {path:'entry.mjs',sourceType:'module',
      code:[
        "import {state} from './state.mjs';",
        "import {inspectRecord} from './record.mjs';",
        entry,
        'console.log(JSON.stringify([state.secretField,result]));'
      ].join('\n')}
  ];
}

for(const [label,code] of /** @type {[string,string][]} */ ([
  ['inline Promise.then closure',[
    'const task=Promise.resolve().then(()=>globalThis.RUNTIME_FACTORY);',
    'const ctor=await task;'
  ].join('\n')],
  ['named Promise.then callback',[
    'function getFactory(){return globalThis.RUNTIME_FACTORY;}',
    'const ctor=await Promise.resolve().then(getFactory);'
  ].join('\n')]
])){
  test('host-provided Function via '+label+' preserves observed ESM keys',async()=>{
    const files=graph([
      code,
      "const remote=await ctor(\"return import('./state.mjs')\")();",
      "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
    ].join('\n'));
    const native=await execute(files,true);
    assert.equal(native,'[41,[3,["secretField"],41]]\n');
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'async-host-callback-'+label,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await execute(generated.files,true),native,label);
    assert.equal(generated.crossFile.properties,0,label);
  });
}

test('literal-only Promise callback retains the proven own-record rewrite',async()=>{
  const files=graph([
    'const value=await Promise.resolve().then(()=>7);',
    "const result=[inspectRecord('externalFormat').value,value];"
  ].join('\n'));
  const native=await execute(files);
  const generated=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'async-host-safe-primitive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(generated.files),native);
  assert.equal(generated.crossFile.properties,1,
    'Safe literal callback should not force an all-zero property transform');
});
