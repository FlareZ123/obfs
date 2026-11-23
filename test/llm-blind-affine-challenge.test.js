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


/**
 * @param {string} source
 * @returns {Promise<Record<string,(value:number)=>number>>}
 */
async function loadPublicEsm(source){
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  return /** @type {Promise<Record<string,(value:number)=>number>>} */(import(url));
}

for(const mode of /** @type {const} */(['coo','sno'])){
  test('matched '+mode.toUpperCase()+' challenge pairs affine output with actual esbuild minification',
    async()=>{
      const {createBlindAffineMatchedChallenge}=require('../sims/llm-blind-affine-challenge');
      const trial=await createBlindAffineMatchedChallenge(mode);
      const {candidate,control}=trial.questions;
      assert.deepEqual(Object.keys(trial.questions),['candidate','control']);
      for(const question of [candidate,control]){
        assert.equal(question.environment,mode);
        assert.deepEqual(question.exports,['round1','round2','round3']);
        assert.match(question.sourceSha256,/^[a-f0-9]{64}$/u);
        assert.equal(createHash('sha256').update(question.source).digest('hex'),
          question.sourceSha256);
        assert.equal('originalSource' in question,false);
        assert.equal('offsets' in question,false);
      }
      assert.equal(candidate.originalCommitment,control.originalCommitment);
      assert.equal(candidate.instruction,control.instruction);
      assert.equal(candidate.answerSchema,control.answerSchema);
      assert.notEqual(candidate.source,control.source);
      assert.throws(()=>trial.reveal(),/both arms/u);
      assert.throws(()=>trial.verify(/** @type {any} */('other'),{}),/candidate or control/u);

      const candidateModule=await loadPublicEsm(candidate.source);
      const controlModule=await loadPublicEsm(control.source);
      const candidateAnswer=Object.fromEntries(candidate.exports.map(name=>[
        name,candidateModule[name](0)
      ]));
      const controlAnswer=Object.fromEntries(control.exports.map(name=>[
        name,controlModule[name](0)
      ]));
      assert.deepEqual(candidateAnswer,controlAnswer);

      assert.deepEqual(trial.verify('candidate',candidateAnswer),{
        passed:true,comparisons:3072,
        claim:'Matched all three private arithmetic functions'
      });
      assert.throws(()=>trial.reveal(),/both arms/u);
      assert.throws(()=>trial.verify('candidate',candidateAnswer),/one answer per arm/u);
      assert.deepEqual(trial.verify('control',controlAnswer),{
        passed:true,comparisons:3072,
        claim:'Matched all three private arithmetic functions'
      });
      assert.throws(()=>trial.verify('control',controlAnswer),/one answer per arm/u);

      const secret=trial.reveal();
      assert.deepEqual(secret.offsets,candidateAnswer);
      assert.equal(secret.commitment,candidate.originalCommitment);
      assert.equal(createHash('sha256').update(
        secret.salt+'\0'+secret.originalSource).digest('hex'),secret.commitment);
      assert.deepEqual(secret.sourceHashes,{
        candidate:candidate.sourceSha256,control:control.sourceSha256
      });
      assert.deepEqual(secret.candidateMetrics,{
        polyvariantFunctions:3,polyvariantPaths:6
      });
      assert.equal(secret.minifier.name,'esbuild');
      assert.equal(secret.minifier.version,require('esbuild').version);
      assert.deepEqual(secret.minifier.options,{
        format:'esm',loader:'js',target:'es2022',minify:true,legalComments:'none'
      });
      const original=await loadPublicEsm(secret.originalSource);
      const inputs=[-2147483648,-1,0,1,2147483647,0x12345678];
      for(const name of candidate.exports){
        for(const input of inputs){
          assert.equal(candidateModule[name](input),original[name](input));
          assert.equal(controlModule[name](input),original[name](input));
        }
      }
    });
}
