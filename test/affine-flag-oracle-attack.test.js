'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {learnFlag,parity}=require('../sims/affine-flag-oracle-attacker');
const {
  makeDenseOracle,makeSparseWitness,makeUnstructuredOracle
}=require('../sims/affine-flag-oracle-fixtures');

/**
 * Independently check that an empirical flag is truly a derivative-linear
 * flag for an entire small-domain source, including every input point and
 * every basis direction of the current surviving subspace.
 * @param {number} bits
 * @param {(input:number)=>number} oracle
 * @param {import('../sims/affine-flag-oracle-attacker').FlagStep[]} steps
 * @returns {number}
 */
function verifyGlobalFlag(bits,oracle,steps) {
  const zero=oracle(0);
  let directions=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  let equalities=0;
  for(let k=0;k<bits;k++) {
    const step=steps[k];
    assert.ok(step,'Expected one learned flag level per bit');
    assert.ok(directions.includes(step.direction),
      'Selected quotient direction must be in the current subspace');
    const derivatives=directions.map(h=>parity(step.mask&(oracle(h)^zero)));
    const pivot=directions.indexOf(step.direction);
    assert.equal(derivatives[pivot],1,
      'Selected direction must toggle the current output quotient');
    for(let i=0;i<directions.length;i++) {
      for(let x=0;x<2**bits;x++) {
        const observed=parity(step.mask&(oracle(x^directions[i])^oracle(x)));
        assert.equal(observed,derivatives[i],
          'Globally invalid input/output derivative flag at stage '+k);
        equalities++;
      }
    }
    directions=directions.flatMap((h,i)=>{
      if(i===pivot)return [];
      return [(h^(derivatives[i]?step.direction:0))>>>0];
    });
  }
  assert.equal(directions.length,0);
  return equalities;
}

test('small-width affine-wrapped triangular oracle: exact derivative flag and exhaustive inversion',()=>{
  let sources=0,globalEquations=0,exactTargets=0;
  for(const bits of [3,5,7])for(let seed=1;seed<=4;seed++) {
    const source=makeDenseOracle(bits,Math.imul(seed+bits,0x9e3779b9));
    const learned=learnFlag(source.evaluate,{
      bits,samplesPerStage:1024,sampleSeed:0x18a2b81d,
      maxQueries:40000
    });
    assert.equal(learned.status,'calibrated',
      'Source must expose all levels of its compatible flag');
    if(learned.status!=='calibrated')throw new Error('No calibrated flag');
    assert.equal(learned.steps.length,bits);
    globalEquations+=verifyGlobalFlag(bits,source.evaluate,learned.steps);
    for(let secret=0;secret<2**bits;secret++) {
      const target=source.evaluate(secret);
      const inverted=learned.invert(target);
      assert.equal(inverted.verified,true,'No unverified candidate may count');
      assert.equal(inverted.input,secret,'Incorrect secret preimage');
      assert.ok(inverted.newQueries<=bits+1);
      exactTargets++;
    }
    sources++;
  }
  assert.equal(sources,12);
  assert.ok(globalEquations>=1000);
  console.log('AFFINE_FLAG_EXHAUSTIVE '+JSON.stringify({sources,globalEquations,exactTargets}));
});

test('32-bit hidden two-sided affine triangular sources admit a sampled exact preimage attack',()=>{
  let sources=0,exactTargets=0,totalTraining=0,maxTraining=0,additionalQueries=0;
  for(let sample=1;sample<=20;sample++) {
    const source=makeDenseOracle(32,Math.imul(sample,0x85ebca6b));
    // Pass only the forward oracle. Hidden audit matrices and offsets are
    // deliberately inaccessible to the learned-flag implementation.
    const learned=learnFlag(source.evaluate,{
      bits:32,samplesPerStage:16,
      sampleSeed:Math.imul(sample+19,0x9e3779b9),
      maxQueries:15000
    });
    assert.equal(learned.status,'calibrated','Missing rank at source '+sample);
    if(learned.status!=='calibrated')throw new Error('No calibrated flag');
    assert.equal(learned.steps.length,32);
    assert.ok(learned.trainingQueries<=12000);
    totalTraining+=learned.trainingQueries;
    maxTraining=Math.max(maxTraining,learned.trainingQueries);
    for(let trial=0;trial<64;trial++) {
      const secret=(Math.imul(sample+trial*17,0x27d4eb2d)^
        Math.imul(trial+sample*3,0x9e3779b9))>>>0;
      const target=source.evaluate(secret);
      const inverse=learned.invert(target);
      assert.equal(inverse.verified,true,
        'Failed exact equality check at source '+sample+' trial '+trial);
      assert.equal(inverse.input,secret,
        'Inversion preimage differs from held-out source secret');
      assert.ok(inverse.newQueries<=33,'Inversion exceeds n+1 online queries');
      additionalQueries+=inverse.newQueries;
      exactTargets++;
    }
    sources++;
  }
  assert.equal(sources,20);
  assert.equal(exactTargets,1280);
  console.log('AFFINE_FLAG_32BIT '+JSON.stringify({
    sources,exactTargets,totalTraining,maxTraining,additionalQueries
  }));
});

test('sparse rare-gate and unstructured permutations preserve explicit failure reporting',()=>{
  const sparse=makeSparseWitness();
  const target=sparse.evaluate(sparse.secret);
  let sparseFailures=0,sparseSuccesses=0;
  for(let seed=1;seed<=24;seed++) {
    const learned=learnFlag(sparse.evaluate,{
      bits:sparse.bits,samplesPerStage:16,
      sampleSeed:Math.imul(seed+31,0x7feb352d),
      maxQueries:20000
    });
    if(learned.status==='unsupported') {
      sparseFailures++;
    }else {
      const inverted=learned.invert(target);
      if(inverted.verified) {
        assert.equal(inverted.input,sparse.secret);
        sparseSuccesses++;
      }else {
        sparseFailures++;
      }
    }
  }
  assert.ok(sparseFailures>=1,
    'Rare gate should witness sampling insufficiency for a fixed seed');
  let refusedUnstructured=0;
  for(let seed=1;seed<=6;seed++) {
    const oracle=makeUnstructuredOracle(8,Math.imul(seed,0x9e3779b9));
    const learned=learnFlag(oracle,{
      bits:8,samplesPerStage:512,sampleSeed:seed+71,maxQueries:12000
    });
    if(learned.status==='unsupported')refusedUnstructured++;
  }
  assert.ok(refusedUnstructured>=5,
    'Random unstructured tables should lack a false universal affine quotient');
  console.log('AFFINE_FLAG_NEGATIVE '+JSON.stringify({
    sparseTrials:24,sparseFailures,sparseSuccesses,
    unstructuredTrials:6,refusedUnstructured
  }));
});
