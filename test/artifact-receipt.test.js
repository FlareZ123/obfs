'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {collectArtifactReceipt,verifyArtifactReceipt}=require('../src/artifact-receipt');

/** @typedef {import('../src/artifact-receipt').ReceiptInput} ReceiptInput */

/**
 * @param {import('node:test').TestContext} t
 * @returns {Promise<ReceiptInput>}
 */
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-artifact-receipt-'));
  t.after(async()=>fs.rm(root,{recursive:true,force:true}));
  for(const arm of ['native','minified','candidate'])
    await fs.mkdir(path.join(root,arm,'assets'),{recursive:true});
  await fs.writeFile(path.join(root,'native','entry.mjs'),'export const value=41;\n');
  await fs.writeFile(path.join(root,'minified','entry.mjs'),'export const value=41;');
  await fs.writeFile(path.join(root,'candidate','entry.mjs'),'export const value=41;');
  await fs.writeFile(path.join(root,'candidate','assets','payload.wasm'),
    Buffer.from([0,97,115,109,1,0,0,0]));
  await fs.writeFile(path.join(root,'package-lock.json'),'{"lockfileVersion":3}\n');
  return {
    sourceCommit:'0123456789abcdef0123456789abcdef01234567',
    lockfile:path.join(root,'package-lock.json'),seed:'frozen-seed',
    flags:['--closed-world','--native-batch'],
    runnerImage:'fixture-image',browserVersion:'fixture-browser',
    arms:[
      {arm:'native',root:path.join(root,'native'),files:['entry.mjs']},
      {arm:'minified',root:path.join(root,'minified'),files:['entry.mjs']},
      {arm:'candidate',root:path.join(root,'candidate'),
        files:['entry.mjs','assets/payload.wasm']}
    ]
  };
}

test('exact three-arm byte graph stays reproducible and verifies',async t=>{
  const input=await fixture(t);
  const receipt=await collectArtifactReceipt(input);
  assert.equal(receipt.schema,1);
  assert.equal(receipt.sourceCommit,input.sourceCommit);
  assert.equal(receipt.environment.node,process.versions.node);
  assert.equal(receipt.environment.v8,process.versions.v8);
  assert.equal(receipt.arms.length,3);
  assert.deepEqual(receipt.arms.map(arm=>arm.arm),['candidate','minified','native']);
  assert.deepEqual(receipt.arms[0].files.map(file=>file.path),
    ['assets/payload.wasm','entry.mjs']);
  assert.equal(receipt.arms[0].files[0].bytes,8);
  assert.equal(receipt.arms[0].files[0].sha256,
    createHash('sha256').update(Buffer.from([0,97,115,109,1,0,0,0])).digest('hex'));
  await verifyArtifactReceipt(receipt,input.arms,input.lockfile);
  const reversed=await collectArtifactReceipt({...input,arms:[...input.arms].reverse(),
    flags:[...input.flags]});
  assert.deepEqual(reversed,receipt);
});

test('reject after candidate mutation while native/control are unchanged',async t=>{
  const input=await fixture(t);
  const receipt=await collectArtifactReceipt(input);
  const candidate=input.arms.find(arm=>arm.arm==='candidate');
  assert.ok(candidate);
  await fs.writeFile(path.join(candidate.root,'entry.mjs'),'export const value=42;');
  await assert.rejects(verifyArtifactReceipt(receipt,input.arms,input.lockfile),
    /Artifact bytes\/load graph changed/);
  assert.equal(receipt.arms.find(arm=>arm.arm==='native')?.files[0].bytes,23);
});

test('reject after dependency lock change and undeclared added artifact',async t=>{
  const input=await fixture(t);
  const receipt=await collectArtifactReceipt(input);
  await fs.writeFile(input.lockfile,'{"lockfileVersion":2}\n');
  await assert.rejects(verifyArtifactReceipt(receipt,input.arms,input.lockfile),
    /Dependency lock changed/);
  const native=input.arms.find(arm=>arm.arm==='native');
  assert.ok(native);
  await fs.writeFile(input.lockfile,'{"lockfileVersion":3}\n');
  await fs.writeFile(path.join(native.root,'unlisted.mjs'),'console.log(1)');
  await assert.rejects(verifyArtifactReceipt(receipt,input.arms,input.lockfile),
    /Artifact group must enumerate every regular delivered file/);
  await assert.rejects(verifyArtifactReceipt(receipt,[
    {...native,files:['entry.mjs','unlisted.mjs']},
    ...input.arms.filter(arm=>arm.arm!=='native')
  ],input.lockfile),/Artifact bytes\/load graph changed/);
});

test('refuse path traversal, Windows-spelled paths and duplicate group entries',async t=>{
  const input=await fixture(t);
  const candidate=input.arms.find(arm=>arm.arm==='candidate');
  assert.ok(candidate);
  for(const illegal of ['../entry.mjs','/entry.mjs','assets\\payload.wasm',
    'assets//payload.wasm','C:/entry.mjs','assets/./payload.wasm']) {
    await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
      arm.arm==='candidate'?{...candidate,files:[illegal]}:arm)}),
      /Artifact path/,illegal);
  }
  await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
    arm.arm==='candidate'?{...candidate,files:['entry.mjs','entry.mjs']}:arm)}),
    /Duplicate artifact path/);
});

test('reject file and ancestor symlinks rather than hashing external bytes',
  {skip:process.platform==='win32'},async t=>{
    const input=await fixture(t);
    const candidate=input.arms.find(arm=>arm.arm==='candidate');
    assert.ok(candidate);
    await fs.symlink(path.join(candidate.root,'entry.mjs'),
      path.join(candidate.root,'linked.mjs'));
    await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
      arm.arm==='candidate'?{...candidate,files:['linked.mjs']}:arm)}),
      /must not contain symlinks/);
    await fs.symlink(path.join(candidate.root,'assets'),
      path.join(candidate.root,'linked-assets'));
    await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
      arm.arm==='candidate'?{...candidate,files:['linked-assets/payload.wasm']}:arm)}),
      /must not contain symlinks/);
  });

test('refuse incomplete or duplicated candidate/control arms',async t=>{
  const input=await fixture(t);
  await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.slice(0,2)}),
    /Exactly three matched/);
  await assert.rejects(collectArtifactReceipt({...input,arms:[
    input.arms[0],input.arms[1],input.arms[1]]}),
    /candidate, ordinary minified control, and native/);
});


test('receipt path admission rejects Windows alias and malformed Unicode spellings',async t=>{
  const input=await fixture(t);
  const candidate=input.arms.find(arm=>arm.arm==='candidate');
  assert.ok(candidate);
  for(const illegal of [
    'NUL.mjs','CON.txt','assets/COM¹.log','assets/trailing.',
    'assets/trailing ','assets/payload:zone','assets/SHORT~1.MJS',
    'assets/invalid\uD800.mjs'
  ]){
    await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
      arm.arm==='candidate'?{...candidate,files:[illegal]}:arm)}),
    /Artifact path must be portable/,JSON.stringify(illegal));
  }
});

test('receipt refuses Unicode and directory alias collisions in declared graphs',async t=>{
  const input=await fixture(t);
  const candidate=input.arms.find(arm=>arm.arm==='candidate');
  assert.ok(candidate);
  for(const paths of [
    ['entry.mjs','ENTRY.mjs'],
    ['café.mjs','cafe\u0301.mjs'],
    ['σ.mjs','ς.mjs'],
    ['assets/payload.wasm','ASSETS/another.wasm'],
    ['assets','assets/payload.wasm']
  ]){
    await assert.rejects(collectArtifactReceipt({...input,arms:input.arms.map(arm=>
      arm.arm==='candidate'?{...candidate,files:paths}:arm)}),
    /Ambiguous artifact path|File conflicts with directory/,
    JSON.stringify(paths));
  }
});

test('receipt refuses undeclared filesystem Unicode aliases before hashing',
  {skip:process.platform==='win32'},async t=>{
    const input=await fixture(t);
    const candidate=input.arms.find(arm=>arm.arm==='candidate');
    assert.ok(candidate);
    const extra=path.join(candidate.root,'cafe\u0301.mjs');
    const primary=path.join(candidate.root,'café.mjs');
    await fs.writeFile(extra,'export default 1;');
    await fs.writeFile(primary,'export default 2;');
    await assert.rejects(collectArtifactReceipt(input),
      /Ambiguous artifact path|Artifact group must enumerate every regular delivered file/);
  });
