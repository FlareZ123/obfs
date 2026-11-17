'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const {createBlindAffineChallenge}=require('../sims/llm-blind-affine-challenge');
const {recover}=require('../sims/polyvariant-affine-static-recover');

/**
 * The public source-only interpreter is the executable negative control.
 * It sees the emitted question's code and exported names only. Original
 * private source and offsets are revealed only after a one-shot submission.
 *
 * @param {'coo'|'sno'} mode
 */
function exercise(mode){
  const trial=createBlindAffineChallenge(mode);
  const {question}=trial;
  assert.equal(question.environment,mode);
  assert.deepEqual(question.exports,['round1','round2','round3']);
  assert.match(question.sourceSha256,/^[a-f0-9]{64}$/u);
  assert.match(question.originalCommitment,/^[a-f0-9]{64}$/u);
  assert.equal(createHash('sha256').update(question.source).digest('hex'),
    question.sourceSha256);
  assert.equal(question.source.includes('_ap_input_'),true);
  assert.equal('originalSource' in question,false);
  assert.equal('offsets' in question,false);
  assert.throws(()=>trial.reveal(),/Submit one answer before source disclosure/u);
  const recovered=Object.fromEntries(question.exports.map(name=>{
    const answer=recover(question.source,name,'module');
    assert.equal(answer.cases,2);
    assert.ok(Number.isSafeInteger(answer.offset));
    return [name,answer.offset];
  }));
  const verdict=trial.verify(recovered);
  assert.deepEqual(verdict,{
    passed:true,comparisons:3072,
    claim:'Matched all three private arithmetic functions'
  });
  assert.throws(()=>trial.verify(recovered),/only one answer/u);
  const privateState=trial.reveal();
  assert.deepEqual(privateState.offsets,recovered);
  assert.equal(createHash('sha256').update(
    privateState.salt+'\0'+privateState.originalSource).digest('hex'),
  privateState.commitment);
  assert.equal(privateState.commitment,question.originalCommitment);
}

test('fresh unshown COO three-leaf challenge is reconstructible from published text',
  ()=>exercise('coo'));

test('fresh unshown SNO three-leaf challenge is reconstructible from published text',
  ()=>exercise('sno'));

test('blind verifier rejects malformed source-only answers and discloses after submission',()=>{
  const trial=createBlindAffineChallenge('coo');
  assert.deepEqual(trial.verify({round1:7,round2:2}),{
    passed:false,comparisons:0,claim:'Malformed offset answer'
  });
  assert.throws(()=>trial.verify({round1:1,round2:1,round3:1}),/only one answer/u);
  const secret=trial.reveal();
  assert.equal(typeof secret.originalSource,'string');
  assert.deepEqual(Object.keys(secret.offsets),['round1','round2','round3']);
});

test('blind verifier rejects incorrect signed Int32 offset',()=>{
  const trial=createBlindAffineChallenge('coo');
  const answer=Object.fromEntries(trial.question.exports.map(name=>[
    name,recover(trial.question.source,name,'module').offset
  ]));
  answer.round3=(answer.round3+1)|0;
  const result=trial.verify(answer);
  assert.equal(result.passed,false);
  assert.equal(result.claim,'Held-out Int32 mismatch');
});

test('unrecognized obfuscation mode is rejected before exposing a question',()=>{
  assert.throws(()=>createBlindAffineChallenge(
    /** @type {'coo'} */(/** @type {unknown} */('foo'))),/COO or SNO/u);
});
