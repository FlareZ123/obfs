'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');
const {createMatchedBlindAffineChallenge}=require('../sims/llm-matched-affine-challenge');
const {attackPublishedSource,minifiedOffset}=require('../sims/llm-matched-affine-static-attack');

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' same-source blind-family generated and minified arms recover statically',async()=>{
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
      const publishedModules=await Promise.all(trial.questions.map(q=>
        import('data:text/javascript;charset=utf-8,'+encodeURIComponent(q.source))
      ));
      const offlineModules=await Promise.all(observed.map(attacker=>
        import('data:text/javascript;charset=utf-8,'+
          encodeURIComponent(attacker.reconstructedSource))
      ));
      // The attack reconstructs runnable ESM, retaining all advertised named
      // exports without executing compiler internals or the original source.
      // These are post-commit parity checks, never attack-time oracle calls.
      for(let position=0;position<2;position++){
        for(let index=0;index<256;index++){
          const input=Math.imul(index^0x5c3f2d1a,0x9e3779b1)|0;
          for(const name of ['round1','round2','round3']){
            assert.equal(offlineModules[position][name](input),
              publishedModules[position][name](input),
              mode+'/'+iteration+'/'+position+'/'+name+'/'+index);
          }
        }
      }
      for(let position=0;position<2;position++){
        assert.equal(observed[position].kind,disclosed.arms[position]);
        assert.ok(observed[position].bytes>0);
        assert.ok(Number.isFinite(observed[position].attackMs));
      }
      // Preserve the exact randomly sampled original and both public
      // artifacts only after grading, so independent researchers can
      // reproduce this executable static attack. These archived cases are
      // deliberately ineligible for any future sealed LLM trial.
      const receiptDir=process.env.OBFS_AFFINE_RECEIPT_DIR;
      if(receiptDir){
        await fs.mkdir(receiptDir,{recursive:true});
        await atomicWrite(path.join(receiptDir,mode+'-'+iteration+'.json'),
          JSON.stringify({mode,iteration,questions:trial.questions,
            disclosed,attacks:observed,verdicts},null,2)+'\n');
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
        heldOutComparisonsPerArm:3072,
        rebuiltEsmComparisonsPerArm:768
      }));
    }
  });
}

test('static source-only ESM reconstruction refuses a missing advertised export',()=>{
  assert.throws(()=>attackPublishedSource(
    'export function round1(input){return (((input|0)+3)|0);}'
  ),/Unavailable static function export round2|Missing proved public Int32 translation/u);
});

test('symbolic static minified parser refuses unnormalized or nonaffine expressions',()=>{
  const rejected=[
    'function n(x){return (x+1)|0;}',
    'function n(x){return ((x+2)*(x-3))|0;}',
    'function n(x){return (x.y+3)|0;}',
    'function n(x){return (x|0)+outside|0;}',
    'function n(x){return x+1;}',
    'function n(x){return (x|0)+17;}',
    'function n(x){return ((x|0)+17)-4;}',
    'function n(x){return (x|0)|1;}',
    'function n(x){return ((x|0)*2)|0;}',
    'function n(x,y){return (x|0)+2|0;}',
    'function n(x){const a=x|0;return a+2|0;}',
    'async function n(x){return ((x|0)+2)|0;}',
    'async x=>(((x|0)+2)|0)',
    'function* n(x){return ((x|0)+2)|0;}'
  ];
  for(const source of rejected){
    assert.throws(()=>minifiedOffset(source),TypeError,source);
  }
  assert.equal(minifiedOffset('function n(x){return ((x|0)+17)-4|0;}'),13);
  assert.equal(minifiedOffset('x=>(((x|0)-7)+12)|0'),5);
  assert.equal(minifiedOffset('function n(x){return ((x|0)+3)|0;}'),3);
});
