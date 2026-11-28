'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {verifyScoPrivateSourceDigests}=require('../src/sco-private-integrity');
const {partitionScoSelectedAsyncExports}=require('../src');

const main='import {mark} from "./leaf.mjs"; export function probe(){return mark;}';
const approvedLeaf='export const mark="reviewed-child";';
const unapprovedLeaf='export const mark="unreviewed-child";';

/**
 * @param {string} name
 * @param {string} code
 * @returns {{path:string,sha256:string}}
 */
function committed(name,code){
  return {path:name,sha256:createHash('sha256').update(code).digest('hex')};
}

const partition={privateSourceDigests:[
  committed('private/main.mjs',main),
  committed('private/leaf.mjs',approvedLeaf)
]};

test('private SCO verifier refuses in-root symlink that changes Node ESM import graph',{
  timeout:15000,
  skip:process.platform==='win32'?
    'Windows hosted runner symlink privilege varies':false
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-inside-symlink-'));
  try{
    await fs.mkdir(path.join(root,'private'),{recursive:true});
    await fs.mkdir(path.join(root,'mirror'),{recursive:true});
    await fs.writeFile(path.join(root,'private','leaf.mjs'),approvedLeaf);
    await fs.writeFile(path.join(root,'mirror','main.mjs'),main);
    await fs.writeFile(path.join(root,'mirror','leaf.mjs'),unapprovedLeaf);
    await fs.symlink(path.join(root,'mirror','main.mjs'),
      path.join(root,'private','main.mjs'));
    // The committed main source text is unchanged, but Node's default ESM
    // realpath resolution loads the child relative to its symlink target.
    const imported=await import(pathToFileURL(path.join(root,'private','main.mjs')).href);
    assert.equal(imported.probe(),'unreviewed-child',
      'The source-committed and Node-executed private ESM graphs diverged');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,root),
      /private source path contains symlink: private\/main\.mjs/u,
      'A mere inside-root realpath/byte-hash check is not a closed ESM graph check');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

// This fixture uses the production graph compiler, not a synthetic digest
// object, to demonstrate that the exact audited static import closure can be
// verified against a path that Node will resolve to a different child graph.
test('compiled SCO manifest rejects an in-root alias before native private ESM load',{
  timeout:15000,
  skip:process.platform==='win32'?
    'Windows hosted runner symlink privilege varies':false
},async()=>{
  const entry=[
    'import {deriveProof} from "./private/engine.mjs";',
    'export async function protectedDigest(v){return deriveProof(v);}',
    'export function local(v){return String(v);}'
  ].join('\n');
  const engine='import {hidden} from "./leaf.mjs"; '+
    'export function deriveProof(v){return hidden+v;}';
  const leaf='export const hidden=41;';
  const poisonedLeaf='export const hidden=999;';
  const issued=partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',code:entry
  },{
    seed:'sco-symlink-real-import-20261128',privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[
      {path:'private/engine.mjs',code:engine},
      {path:'private/leaf.mjs',code:leaf}
    ]
  });
  assert.deepEqual(issued.privateSourceDigests?.map(item=>item.path),
    ['entry.mjs','private/engine.mjs','private/leaf.mjs']);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-issued-symlink-'));
  try{
    await fs.mkdir(path.join(root,'private'),{recursive:true});
    await fs.mkdir(path.join(root,'mirror'),{recursive:true});
    await fs.writeFile(path.join(root,'entry.mjs'),entry);
    await fs.writeFile(path.join(root,'private','leaf.mjs'),leaf);
    await fs.writeFile(path.join(root,'mirror','engine.mjs'),engine);
    await fs.writeFile(path.join(root,'mirror','leaf.mjs'),poisonedLeaf);
    await fs.symlink(path.join(root,'mirror','engine.mjs'),
      path.join(root,'private','engine.mjs'));
    const executed=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
    assert.equal(await executed.protectedDigest(1),1000,
      'Node executes an uncommitted private child despite matched entry and engine bytes');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(issued,root),
      /private source path contains symlink: private\/engine\.mjs/u);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('private SCO verifier rejects an in-root symlinked ancestor directory',{
  timeout:15000,
  skip:process.platform==='win32'?
    'Windows hosted runner symlink privilege varies':false
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-symlink-ancestor-'));
  try{
    await fs.mkdir(path.join(root,'source'),{recursive:true});
    await fs.writeFile(path.join(root,'source','main.mjs'),main);
    await fs.writeFile(path.join(root,'source','leaf.mjs'),approvedLeaf);
    await fs.symlink(path.join(root,'source'),path.join(root,'private'),'dir');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(partition,root),
      /private source path contains symlink: private\/main\.mjs/u);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('private SCO verifier accepts genuine separately deployed ESM source files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-unsymlinked-'));
  try{
    await fs.mkdir(path.join(root,'private'),{recursive:true});
    await fs.writeFile(path.join(root,'private','main.mjs'),main);
    await fs.writeFile(path.join(root,'private','leaf.mjs'),approvedLeaf);
    await verifyScoPrivateSourceDigests(partition,root);
    const imported=await import(pathToFileURL(path.join(root,'private','main.mjs')).href);
    assert.equal(imported.probe(),'reviewed-child',
      'A real distinct-file deployment resolves the approved relative ESM import');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
