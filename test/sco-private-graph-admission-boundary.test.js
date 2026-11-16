'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports}=require('../src');

const CANARY='__obfsPrivateGraphCrossRealmCanary20261116';

test('explicit private-module opt-in does not prove cross-realm equivalence',{
  timeout:15000
},async()=>{
  const original=[
    'import {deriveProof} from "./private/engine.mjs";',
    'export async function protectedDigest(value){return deriveProof(value);}',
    'export function local(){return Math.'+CANARY+'??0;}'
  ].join('\n');
  const privateFile=[
    'Math.'+CANARY+'=41;',
    'export function deriveProof(value){return value.length;}'
  ].join('\n');
  const compiled=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:original,sourceType:'module'
  },{
    seed:'side-effect-boundary-20261116',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs']
  });
  assert.deepEqual(compiled.clientFile.privateModulePaths,['private/engine.mjs']);
  // The compiler sees the importing module and an allowlisted dependency path.
  // It cannot see the dependency's top-level ambient state mutation.
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-realm-warning-'));
  const originalDescriptor=Object.getOwnPropertyDescriptor(Math,CANARY);
  try{
    await atomicWrite(path.join(dir,'mixed.mjs'),original);
    await atomicWrite(path.join(dir,'private/engine.mjs'),privateFile);
    const native=await import(pathToFileURL(path.join(dir,'mixed.mjs')).href);
    assert.equal(native.local(),41,
      'Native module initialization shares the ordinary same-process realm');
    const child=spawnSync(process.execPath,['--input-type=module','-e',
      compiled.clientFile.code+'\nconsole.log(local());'],{
      encoding:'utf8',timeout:10000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout.trim(),'0',
      'The public facade executes in a distinct realm without imported module side effects');
    assert.notEqual(child.stdout.trim(),String(native.local()));
  }finally{
    if(originalDescriptor)Object.defineProperty(Math,CANARY,originalDescriptor);
    else Reflect.deleteProperty(Math,CANARY);
    await fs.rm(dir,{recursive:true,force:true});
  }
});
