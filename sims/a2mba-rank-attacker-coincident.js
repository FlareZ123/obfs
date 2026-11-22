'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const {ATTACKER_COMMIT,SEED,HashStream,emitCase}=
  require('./a2mba-rotated-core-heldout');
const {recoverRotatedCoreSource}=require('./a2mba-rotated-core-static-recover');
const {nonlinearResidualRank128}=require('./a2mba-rotated-core-affine-rank');
const {nativeRegion32}=require('./a2mba-rotated-core-int32-pilot');

/**
 * Connect full-output nonlinear rank to the same post-freeze generated
 * source-only attacker corpus. Protected code is executed only by the
 * verifier AFTER the independent static recovery has finished.
 *
 * @returns {{cases:number,rank32:number,recoveries:number,
 *   testedCalls:number,sourceDigest:string,seed:string,attackerCommit:string}}
 */
function runCoincidentRankAttack(){
  const stream=new HashStream(SEED);
  const digest=createHash('sha256');
  let rank32=0,recoveries=0,testedCalls=0;
  for(let index=0;index<32;index++){
    const heldout=emitCase(stream);
    digest.update(String(Buffer.byteLength(heldout.source))).update(':')
      .update(heldout.source).update('\n');
    // This recovery sees the published source only. It does not call the
    // protected function or receive the generator's hidden rotation field.
    const extracted=recoverRotatedCoreSource(heldout.source);
    assert.equal(extracted.rotation,heldout.rotation);
    recoveries++;
    const originalName=[...heldout.source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\(/gm)]
      .at(-1)?.[1];
    assert.ok(originalName);
    const original=/** @type {(x:number,y:number,z:number,t:number)=>number} */ (
      vm.runInNewContext(heldout.source+'\n'+originalName+';'));
    const recovered=/** @type {(x:number,y:number,z:number,t:number)=>number} */ (
      vm.runInNewContext('('+extracted.recoveredSource+')'));
    /** @type {(x:number,y:number,z:number,t:number)=>number} */
    const verified=(x,y,z,t)=>{
      const got=original(x,y,z,t);
      const decoded=recovered(x,y,z,t);
      assert.equal(got,decoded);
      assert.equal(got,nativeRegion32(x,y,z,t));
      testedCalls++;
      return got;
    };
    const result=nonlinearResidualRank128(verified);
    assert.equal(result.rank,32);
    assert.equal(result.observations,12224);
    rank32++;
    // Preserve the original held-out corpus's generator stream advance:
    // runHeldoutRecovery consumes one word as its subsequent sample seed.
    stream.word();
  }
  assert.equal(testedCalls,32*12353);
  return {cases:32,rank32,recoveries,testedCalls,
    sourceDigest:digest.digest('hex'),seed:SEED,attackerCommit:ATTACKER_COMMIT};
}

if(require.main===module)console.log(JSON.stringify(runCoincidentRankAttack(),null,2));
module.exports={runCoincidentRankAttack};
