'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,verifyScoPrivateSourceDigests}=require('../src');

const source=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(v){return deriveProof(v);}',
  'export function local(v){return String(v);}'
].join('\n');
const engine={
  path:'private/engine.mjs',
  code:'import {hidden} from "./leaf.mjs"; export function deriveProof(v){return hidden+v;}'
};
const leaf={path:'private/leaf.mjs',code:'export const hidden=41;'};

/** @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',code:source,sourceType:'module'},{
    seed:'sco-deployment-integrity-20261116',privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[engine,leaf]
  });
}

test('trusted-server static private graph digests match original deployed bytes',{
  timeout:15000
},async()=>{
  const partition=compile();
  assert.deepEqual(partition.privateSourceDigests?.map(item=>item.path),
    ['mixed.mjs','private/engine.mjs','private/leaf.mjs']);
  for(const commitment of partition.privateSourceDigests??[]){
    assert.match(commitment.sha256,/^[a-f0-9]{64}$/u);
  }
  assert.equal(partition.clientFile.privateSourceDigests,undefined,
    'No source commitment hashes should be delivered in the browser artifact');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-digest-'));
  try{
    await atomicWrite(path.join(root,'mixed.mjs'),source);
    await atomicWrite(path.join(root,engine.path),engine.code);
    await atomicWrite(path.join(root,leaf.path),leaf.code);
    await verifyScoPrivateSourceDigests(partition,root);
    await atomicWrite(path.join(root,leaf.path),leaf.code+'\n');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,root),
      /private source bytes changed since partition: private\/leaf\.mjs/);
    await atomicWrite(path.join(root,leaf.path),leaf.code);
    await verifyScoPrivateSourceDigests(partition,root);
    await atomicWrite(path.join(root,'mixed.mjs'),source+'\n');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,root),
      /private source bytes changed since partition: mixed\.mjs/);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('private source verification requires a real audited commitment and absolute root',async()=>{
  const partition=compile();
  await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,'.'),
    /absolute directory/);
  await assert.rejects(()=>verifyScoPrivateSourceDigests({
    clientFile:partition.clientFile
  },os.tmpdir()),/no audited private source commitments/);
  const malformed={...partition,privateSourceDigests:[
    {path:'mixed.mjs',sha256:'definitely-not-a-digest'}
  ]};
  await assert.rejects(()=>verifyScoPrivateSourceDigests(malformed,os.tmpdir()),
    /commitment is malformed/);
  const duplicates={...partition,privateSourceDigests:[
    {path:'private/leaf.mjs',sha256:'0'.repeat(64)},
    {path:'PRIVATE/LEAF.MJS',sha256:'0'.repeat(64)}
  ]};
  await assert.rejects(()=>verifyScoPrivateSourceDigests(duplicates,os.tmpdir()),
    /path duplicated/);
});

test('private graph commitment validation rejects a symlink escaping the verified root',{
  timeout:15000,
  skip:process.platform==='win32' ? 'Windows hosted runner symlink privilege varies' : false
},async()=>{
  const partition=compile();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-realpath-root-'));
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-realpath-outside-'));
  try{
    await atomicWrite(path.join(root,'mixed.mjs'),source);
    await atomicWrite(path.join(root,engine.path),engine.code);
    await atomicWrite(path.join(outside,'private-leaf.mjs'),leaf.code);
    await fs.symlink(path.join(outside,'private-leaf.mjs'),path.join(root,leaf.path));
    await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,root),
      /private source escapes integrity root: private\/leaf\.mjs/);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
    await fs.rm(outside,{recursive:true,force:true});
  }
});
