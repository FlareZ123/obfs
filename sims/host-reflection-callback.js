'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/** @type {ModuleFile[]} */
const files=[
  {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
  {path:'record.mjs',sourceType:'module',code:[
    "const schema={externalFormat:'audit-v1',auditCount:3};",
    'export function inspectRecord(key){',
    '  return {',
    '    keys:Reflect.ownKeys(schema).sort(),',
    '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true,',
    '    value:schema[key]',
    '  };',
    '}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    "import {state} from './state.mjs';",
    "import {inspectRecord} from './record.mjs';",
    "const captured=inspectRecord('auditCount').value;",
    'const names=typeof captured==="function" ?',
    "  Object.keys((await captured(\"return import('./state.mjs')\")()).state) : null;",
    'console.log(JSON.stringify([state.secretField,names]));'
  ].join('\n')}
];

/** @type {Record<string,string>} */
const hosts={
  clean:'',
  ownKeys:[
    'const ownKeys=Reflect.ownKeys;',
    'Reflect.ownKeys=function(target){',
    "  if(Object.prototype.hasOwnProperty.call(target,'auditCount')) target.auditCount=Function;",
    '  return ownKeys(target);',
    '};'
  ].join('\n'),
  descriptor:[
    'const descriptor=Object.getOwnPropertyDescriptor;',
    'Object.getOwnPropertyDescriptor=function(target,key){',
    "  if(Object.prototype.hasOwnProperty.call(target,'auditCount')) target.auditCount=Function;",
    '  return descriptor(target,key);',
    '};'
  ].join('\n')
};

/**
 * Run the precise ESM graph in an independent process. The host is a Node
 * preloader deliberately withheld from the static-only compiler input.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} graph
 * @param {string} host
 * @returns {Promise<string>}
 */
async function execute(graph,host){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflection-host-'));
  try{
    for(const file of graph)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'host.cjs');
    await atomicWrite(preloader,hosts[host]);
    const child=spawnSync(process.execPath,['--require',preloader,path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'host-reflection-callback-20261116',
    identifiers:false,strings:false,properties:true
  });
  const count=compiled.crossFile.properties;
  const observed=[];
  for(const host of Object.keys(hosts)){
    const native=await execute(files,host);
    const emitted=await execute(compiled.files,host);
    const preserved=native===emitted;
    observed.push({host,native,emitted,preserved});
    if(host==='clean')assert.equal(emitted,native);
    if(host==='ownKeys'||host==='descriptor'){
      assert.equal(native,'[41,["secretField"]]');
      if(count>0)assert.notEqual(emitted,native,
        'A re-entrant host reflection callback should expose renamed private keys');
      else assert.equal(emitted,native,'Full refusal must preserve host semantics');
    }
  }
  console.log(JSON.stringify({renamedPrivateProperties:count,observed},null,2));
  if(count>0)console.log('HOSTILE-RUNTIME SEMANTIC COUNTEREXAMPLE CONFIRMED');
  else console.log('COMPILER REFUSAL PRESERVES HOSTILE-RUNTIME SEMANTICS');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
