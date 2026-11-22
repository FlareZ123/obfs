'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const {SEED,ATTACKER_COMMIT,HashStream,emitHeldout}=
  require('./a2mba-hybrid-opcode-heldout');
const {classifyInt32Binary}=require('./a2mba-hybrid-opcode-classifier');
const {operations,mixedResidual,gf2Rank32}=
  require('./a2mba-opcode-residual-rank');

/** @typedef {'add'|'sub'|'mul'|'and'|'or'|'xor'} Opcode */
/** @typedef {{opcode:Opcode,rank:number,sourceHash:string}} HeldoutRow */

/**
 * Verify rank and one-query offline functional cloning against the exact same
 * 96 emitted, post-attacker-freeze source variants used in the existing suite.
 * Attack classification gets one candidate call. Remaining calls belong only
 * to the independent rank/parity verifier after the attacker is frozen.
 *
 * @returns {{cases:number,queries:number,fullRankCases:number,
 *   ranks:Record<Opcode,number>,rows:HeldoutRow[],seed:string,attackerCommit:string}}
 */
function runHeldoutRankClone() {
  const stream=new HashStream(SEED);
  /** @type {Opcode[]} */
  const opcodes=['add','sub','mul','and','or','xor'];
  /** @type {Record<Opcode,number>} */
  const knownRanks={add:31,sub:31,mul:32,and:32,or:32,xor:0};
  /** @type {HeldoutRow[]} */
  const rows=[];
  let queries=0,fullRankCases=0;
  for(let index=0;index<96;index++) {
    const opcode=opcodes[index%opcodes.length];
    const source=emitHeldout(opcode,stream);
    /** @type {(a:number,b:number)=>number} */
    const protectedFn=vm.runInNewContext(source,{Math});
    let candidateCalls=0;
    const oracle=/** @type {(a:number,b:number)=>number} */ ((a,b)=>{
      candidateCalls++;
      return protectedFn(a,b);
    });
    const classified=classifyInt32Binary(oracle);
    assert.equal(classified,opcode);
    assert.equal(candidateCalls,1);
    queries+=candidateCalls;
    // The attacker has finished after one query. Construct an offline
    // exact native replacement solely from its inferred opcode.
    const offlineClone=operations[classified];
    /** @type {number[]} */
    const residuals=[];
    for(let bit=0;bit<32;bit++) {
      const value=1<<bit;
      const left=opcode==='mul'?1:value;
      const recovered=mixedResidual(protectedFn,left,value);
      assert.equal(recovered,mixedResidual(offlineClone,left,value));
      residuals.push(recovered);
    }
    const rank=gf2Rank32(residuals);
    assert.equal(rank,knownRanks[opcode]);
    if(rank===32)fullRankCases++;
    // Preserve the original generator stream exactly. This word is also the
    // held-out suite's random parity input seed.
    let state=stream.word()|0;
    for(let sample=0;sample<256;sample++) {
      state=(Math.imul(state,1664525)+1013904223)|0;
      const a=state;
      const b=(state^Math.imul(sample,0x45d9f3b))|0;
      assert.equal(offlineClone(a,b),protectedFn(a,b));
    }
    rows.push({opcode,rank,sourceHash:createHash('sha256').update(source).digest('hex')});
  }
  assert.equal(queries,96);
  assert.equal(fullRankCases,48);
  return {cases:rows.length,queries,fullRankCases,ranks:knownRanks,rows,
    seed:SEED,attackerCommit:ATTACKER_COMMIT};
}

if(require.main===module){
  const result=runHeldoutRankClone();
  console.log(JSON.stringify({
    cases:result.cases,queries:result.queries,fullRankCases:result.fullRankCases,
    ranks:result.ranks,seed:result.seed,attackerCommit:result.attackerCommit,
    sourceHashesSha256:createHash('sha256')
      .update(result.rows.map(row=>row.sourceHash).join('\n')).digest('hex')
  },null,2));
}
module.exports={runHeldoutRankClone};
