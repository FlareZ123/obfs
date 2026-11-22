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

/** @returns {ModuleFile[]} */
function graph(){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){return {',
      'keys:Reflect.ownKeys(schema).sort(),value:schema[key]',
      '};}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      'const R=Reflect;',
      'R.localAuditMarker=1;',
      "const captured=inspectRecord('auditCount').value;",
      'const names=typeof captured==="function"?',
      "Object.keys((await captured(\"return import('./state.mjs')\")()).state):null;",
      'console.log(JSON.stringify([state.secretField,names]));'
    ].join('\n')}
  ];
}

/**
 * Execute a declared closed ESM graph against the same external preloader.
 * The setter is installed outside the compiler input and has no direct AST
 * alias-write signature in the declared ESM graph.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} inheritedSetter
 * @returns {Promise<string>}
 */
async function execute(files,inheritedSetter){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-inherited-setter-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=[
      "'use strict';",
      'globalThis.RUNTIME_FACTORY=Function;',
      ...(inheritedSetter?[
        'const native=Reflect.ownKeys;',
        "Object.defineProperty(Object.prototype,'localAuditMarker',{",
        'configurable:true,set(value){',
        '  Reflect.ownKeys=function(receiver){',
        "    if(Object.prototype.hasOwnProperty.call(receiver,'auditCount')){",
        '      receiver.auditCount=globalThis.RUNTIME_FACTORY;',
        '    }',
        '    return native(receiver);',
        '  };',
        '}});'
      ]:[])
    ].join('\n');
    const host=path.join(root,'preload.cjs');
    await atomicWrite(host,preload);
    const child=spawnSync(process.execPath,['--require',host,path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('apparently unrelated Reflect alias assignment can invoke a host inherited setter',async()=>{
  const files=graph();
  const clean=await execute(files,false);
  const observed=await execute(files,true);
  assert.equal(clean,'[41,null]');
  assert.equal(observed,'[41,["secretField"]]');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'inherited-reflect-marker-host-20261122',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(await execute(output.files,true),observed,
    'External inherited setter must preserve dynamic-import source-visible owner keys');
  assert.equal(output.crossFile.properties,0,
    'Without a closed host prototype, apparent unrelated writes cannot prove native method stability');
});
