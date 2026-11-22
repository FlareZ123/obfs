'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const {createMatchedBlindAffineChallenge}=require('../sims/llm-matched-affine-challenge');

const names=Object.freeze(['round1','round2','round3']);

/**
 * Import only the publicly distributed ESM artifact. The original program
 * stays hidden in the challenge closure until both answers are committed.
 * @param {string} source
 * @returns {Promise<Record<string,(input:number)=>number>>}
 */
async function publicModule(source){
  return /** @type {Record<string,(input:number)=>number>} */ (
    await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source))
  );
}

for(const mode of /** @type {Array<'coo'|'sno'>} */(['coo','sno'])){
  test('matched '+mode+' arms share hidden offsets, preserve 1024 outputs and grade once',async()=>{
    const trial=createMatchedBlindAffineChallenge(mode);
    const questions=trial.questions;
    assert.equal(questions.length,2);
    assert.throws(()=>trial.reveal(),/Submit both answers before source disclosure/u);
    assert.equal(questions[0].originalCommitment,questions[1].originalCommitment);
    assert.notEqual(questions[0].sourceSha256,questions[1].sourceSha256);
    /** @type {Array<Record<string,number>>} */
    const submissions=[];
    /** @type {Array<Record<string,(input:number)=>number>>} */
    const publicExports=[];
    for(const item of questions){
      assert.equal(item.environment,mode);
      assert.deepEqual(item.exports,names);
      assert.equal(item.sourceSha256,createHash('sha256').update(item.source).digest('hex'));
      assert.equal('offsets' in item,false);
      assert.equal('originalSource' in item,false);
      const exposed=await publicModule(item.source);
      publicExports.push(exposed);
      const recovered=/** @type {Record<string,number>} */ (Object.fromEntries(
        names.map(name=>[name,exposed[name](0)])
      ));
      submissions.push(recovered);
    }
    assert.deepEqual(submissions[0],submissions[1],
      'Same hidden affine semantics must be exposed by both public artifacts');
    const graded=trial.verify(submissions);
    assert.deepEqual(graded,[0,1].map(()=>({
      passed:true,comparisons:3072,
      claim:'Matched all three private arithmetic functions'
    })));
    assert.throws(()=>trial.verify(submissions),/only one answer set/u);
    const revealed=trial.reveal();
    assert.deepEqual(revealed.offsets,submissions[0]);
    assert.deepEqual(new Set(revealed.arms),
      new Set(['generated','esbuild-minified']));
    assert.equal(createHash('sha256').update(
      revealed.salt+'\0'+revealed.originalSource).digest('hex'),
    revealed.commitment);
    assert.equal(revealed.commitment,questions[0].originalCommitment);
    const original=await publicModule(revealed.originalSource);
    for(let i=0;i<1024;i++){
      const x=Math.imul(i^0x4b1d21a9,0x9e3779b1)|0;
      for(const name of names){
        assert.equal(publicExports[0][name](x),original[name](x),name+'/'+i+'/first');
        assert.equal(publicExports[1][name](x),original[name](x),name+'/'+i+'/second');
      }
    }
  });
}

test('matched one-shot grading keeps correct and incorrect arms separate',()=>{
  const trial=createMatchedBlindAffineChallenge('coo');
  const checked=trial.verify([
    {round1:0,round2:0,round3:0},
    {round1:'incorrect',round2:0,round3:0}
  ]);
  assert.equal(checked[0].passed,false);
  assert.equal(checked[1].passed,false);
  assert.equal(checked[1].claim,'Malformed offset answer');
  assert.throws(()=>trial.verify([]),/only one answer set/u);
  assert.ok(trial.reveal().originalSource.includes('export function round1'));
});

test('unsupported challenge mode is rejected',()=>{
  assert.throws(()=>createMatchedBlindAffineChallenge(
    /** @type {'coo'} */(/** @type {unknown} */('unknown'))
  ),/COO or SNO mode/u);
});
