'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {collectArtifactReceipt,verifyArtifactReceipt}=require('../src/artifact-receipt');
const {prepare}=require('../sims/polyvariant-app-four-way-control');
const {threeQueryTranslationClone}=require('../sims/polyvariant-app-three-query-competitor');

/** @typedef {import('../src/artifact-receipt').ArmInput} ArmInput */
/** @typedef {'native'|'minified'|'candidate'} Arm */

/**
 * Load and run the exact checked-in/distributed three-module graph on disk,
 * including the external host callback trace and stateful scenario output.
 * @param {string} root
 * @param {{kind:unknown,payload:unknown}[]} records
 * @returns {Promise<{output:string,trace:unknown[]}>}
 */
async function runScenario(root,records) {
  const entry=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
  /** @type {unknown[]} */
  const trace=[];
  const output=entry.runScenario(-817,records,{
    /** @param {unknown} record */
    emit(record){trace.push(record);}
  });
  return {output,trace};
}

/**
 * A deterministic held-out signed-Int32 set. The attacker consumes only
 * three public f(0) observations. These 12,288 checks are verifier-only.
 * @param {Record<string,(value:number)=>number>} native
 * @param {Record<string,(value:number)=>number>} publicMath
 * @returns {{oracleCalls:number,comparisons:number,offsets:Record<string,number>}}
 */
function verifyThreeQueryAttack(native,publicMath) {
  const attack=threeQueryTranslationClone(publicMath);
  assert.equal(attack.oracleCalls,3);
  let comparisons=0;
  for(const name of ['round1','round2','round3']){
    for(let index=0;index<4096;index++) {
      const input=index<7?
        [-2147483648,-1,0,1,2147483647,-0,0x12345678|0][index]:
        Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
      const prediction=attack.clone[name](input);
      assert.ok(Object.is(prediction,publicMath[name](input)),name+'/'+index+'/public');
      assert.ok(Object.is(prediction,native[name](input)),name+'/'+index+'/native');
      comparisons++;
    }
  }
  return {oracleCalls:attack.oracleCalls,comparisons,offsets:attack.offsets};
}

test('frozen real three-module native/minified/COO bytes admit same-input attack',async t=>{
  const location=process.env.OBFS_FROZEN_OUTPUT_DIR?
    path.resolve(process.env.OBFS_FROZEN_OUTPUT_DIR):
    await fs.mkdtemp(path.join(os.tmpdir(),'obfs-frozen-real-app-'));
  if(!process.env.OBFS_FROZEN_OUTPUT_DIR)
    t.after(async()=>fs.rm(location,{recursive:true,force:true}));
  const prepared=await prepare();
  assert.equal(prepared.protectedFunctions,3);
  const variants=/** @type {Record<Arm,'native'|'minified'|'published'>} */({
    native:'native',minified:'minified',candidate:'published'
  });
  const names=['math.mjs','state.mjs','entry.mjs'];
  /** @type {ArmInput[]} */
  const arms=[];
  for(const arm of /** @type {Arm[]} */ (['native','minified','candidate'])) {
    const root=path.join(location,arm);
    const graph=prepared.graphs[variants[arm]];
    assert.deepEqual(graph.map(item=>item.path),names,'Exact ESM load graph changed');
    for(const file of graph)
      await atomicWrite(path.join(root,file.path),file.code);
    arms.push({arm,root,files:names});
  }
  const lockfile=path.join(__dirname,'../package-lock.json');
  const receipt=await collectArtifactReceipt({
    arms,lockfile,
    sourceCommit:process.env.GITHUB_SHA??'0123456789abcdef0123456789abcdef01234567',
    seed:'multi-file-attacker-challenge-20261116',
    flags:['mode=coo','experimentalPolyvariantCount=2',
      'experimentalPolyvariantAffine=math.mjs:round1,round2,round3',
      'esbuild.transform(format=esm,loader=js,target=es2022,minify=true)'],
    runnerImage:process.env.ImageOS??null,
    browserVersion:null
  });
  assert.equal(receipt.arms.length,3);
  assert.equal(receipt.arms[0].arm,'candidate');
  assert.equal(receipt.arms[0].files.length,3);
  assert.notEqual(receipt.arms[0].sha256,
    receipt.arms.find(item=>item.arm==='minified')?.sha256,
    'Protected candidate must have independently emitted file bytes');

  const records=[
    {kind:'start',payload:'🧪'},
    {kind:'終',payload:'alpha\u0000beta'},
    {kind:'surrogate',payload:'\uD800'},
    {kind:0,payload:-2147483648},
    {kind:'repeat',payload:'🧪'},
    {kind:'stop',payload:'-0'}
  ];
  const observations=await Promise.all(arms.map(arm=>runScenario(arm.root,records)));
  assert.equal(observations[0].trace.length,records.length);
  for(const result of observations.slice(1)){
    assert.equal(result.output,observations[0].output);
    assert.deepEqual(result.trace,observations[0].trace);
  }
  const math=await Promise.all(arms.map(async arm=>
    import(pathToFileURL(path.join(arm.root,'math.mjs')).href)));
  const minified=verifyThreeQueryAttack(math[0],math[1]);
  const candidate=verifyThreeQueryAttack(math[0],math[2]);
  assert.equal(minified.comparisons,12288);
  assert.equal(candidate.comparisons,12288);
  assert.deepEqual(minified.offsets,candidate.offsets);
  await verifyArtifactReceipt(receipt,arms,lockfile);

  const report={
    receipt,meaningfullyTransformedSelectedFunctions:prepared.protectedFunctions,
    matchedThreeQueryAttack:{minified,candidate},
    nativeMinifiedCandidateParity:true,externalCallbackCount:records.length,
    observation:'Existing affine COO is equally reconstructable as conventional minification',
    limitation:'This is a frozen negative attack and semantic pilot, not CPU-budget admission'
  };
  await atomicWrite(path.join(location,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log('FROZEN_POLYVARIANT_RECEIPT '+JSON.stringify({
    sourceCommit:receipt.sourceCommit,lockSha256:receipt.lockSha256,
    environment:receipt.environment,
    arms:receipt.arms.map(arm=>({arm:arm.arm,sha256:arm.sha256,
      bytes:arm.files.reduce((n,file)=>n+file.bytes,0)})),
    matchedThreeQueryAttack:report.matchedThreeQueryAttack
  }));
});
