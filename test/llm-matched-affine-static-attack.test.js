'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createMatchedBlindAffineChallenge}=require('../sims/llm-matched-affine-challenge');
const {attackPublishedSource,minifiedOffset}=require('../sims/llm-matched-affine-static-attack');

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' same-source blind-family generated and minified arms recover statically',()=>{
    for(let iteration=0;iteration<8;iteration++){
      const trial=createMatchedBlindAffineChallenge(mode);
      const observed=trial.questions.map(question=>attackPublishedSource(question.source));
      assert.deepEqual(new Set(observed.map(result=>result.kind)),
        new Set(['generated','esbuild-minified']));
      assert.deepEqual(observed[0].offsets,observed[1].offsets,
        mode+'/'+iteration+'/same-source public-byte offsets');
      const verdicts=trial.verify(observed.map(result=>result.offsets));
      assert.deepEqual(verdicts,[0,1].map(()=>({
        passed:true,comparisons:3072,
        claim:'Matched all three private arithmetic functions'
      })));
      const disclosed=trial.reveal();
      assert.deepEqual(observed[0].offsets,disclosed.offsets);
      for(let position=0;position<2;position++){
        assert.equal(observed[position].kind,disclosed.arms[position]);
        assert.ok(observed[position].bytes>0);
        assert.ok(Number.isFinite(observed[position].attackMs));
      }
      // Observe source-only attack equivalence and distributed byte volume.
      // Fresh unseeded sources are intentionally not treated as a frozen
      // statistical population; the source commitment anchors this record.
      console.log('MATCHED_AFFINE_STATIC '+JSON.stringify({
        mode,iteration,sourceCommitment:disclosed.commitment,
        arms:observed.map(result=>({
          kind:result.kind,
          bytes:result.bytes,
          staticMs:Number(result.attackMs.toFixed(3))
        })),
        recoveredExports:3,distinctChosenRuntimeQueries:0,
        heldOutComparisonsPerArm:3072
      }));
    }
  });
}

test('symbolic static minified parser refuses unnormalized or nonaffine expressions',()=>{
  const rejected=[
    'function n(x){return (x+1)|0;}',
    'function n(x){return ((x+2)*(x-3))|0;}',
    'function n(x){return (x.y+3)|0;}',
    'function n(x){return (x|0)+outside|0;}',
    'function n(x){return x+1;}',
    'function n(x){return ((x|0)*2)|0;}',
    'function n(x,y){return (x|0)+2|0;}',
    'function n(x){const a=x|0;return a+2|0;}'
  ];
  for(const source of rejected){
    assert.throws(()=>minifiedOffset(source),TypeError,source);
  }
  assert.equal(minifiedOffset('function n(x){return ((x|0)+17)-4|0;}'),13);
  assert.equal(minifiedOffset('x=>(((x|0)-7)+12)|0'),5);
  assert.equal(minifiedOffset('function n(x){return ((x|0)+3)|0;}'),3);
});
