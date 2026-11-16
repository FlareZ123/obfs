'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports}=require('../src');

const CANARY='__obfsPrivateGraphCrossRealmCanary20261116';

test('unsafe private graph intrinsic side effects are rejected by current selective SCO guard',{
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
  // Earlier versions accepted this unsafe split, producing a public module
  // whose intrinsic-state read diverged from the original shared realm.
  // The current conservative public-function guard rejects it before emission.
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:original,sourceType:'module'
  },{
    seed:'side-effect-boundary-20261116',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs']
  }),/cannot partition realm-local intrinsic state access: local/);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-realm-warning-'));
  const originalDescriptor=Object.getOwnPropertyDescriptor(Math,CANARY);
  try{
    await atomicWrite(path.join(dir,'mixed.mjs'),original);
    await atomicWrite(path.join(dir,'private/engine.mjs'),privateFile);
    const native=await import(pathToFileURL(path.join(dir,'mixed.mjs')).href);
    assert.equal(native.local(),41,
      'Native module initialization shares the ordinary same-process realm');
    // This confirms the cross-realm mutation that a separate public runtime
    // would lose. A compiler refusal preserves behavior by declining the split.
  }finally{
    if(originalDescriptor)Object.defineProperty(Math,CANARY,originalDescriptor);
    else Reflect.deleteProperty(Math,CANARY);
    await fs.rm(dir,{recursive:true,force:true});
  }
});
