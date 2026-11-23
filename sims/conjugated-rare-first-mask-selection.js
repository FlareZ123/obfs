'use strict';

const assert=require('node:assert/strict');

/**
 * Exhaust all invertible GF(2) 4-by-4 matrices and all four hidden lower
 * prefixes for the conjugated triangular shear F(x)=A^-1(P_c(Ax)).
 *
 * The P_c source toggles source bit j=2 iff its two lower source bits
 * match c. Every resulting F is a 4-bit permutation and the unperturbed
 * control is exactly the same public identity map for all hidden A.
 *
 * This finite enumerator uses full 16-point truth maps to check each hidden
 * source separately from any adaptive attack on its output. It also checks
 * that every oracle is an involution: F(F(y))=y, so one forward query at
 * a target y returns its exact preimage, without identifying a valid mask.
 */

/** @param {number} x @returns {0|1} */
function parity(x) {
  let y=x>>>0;
  y^=y>>>2;
  y^=y>>>1;
  return /** @type {0|1} */(y&1);
}

/**
 * @param {number[]} rows
 * @param {number} x
 * @returns {number}
 */
function multiplyRows(rows,x) {
  let output=0;
  for(let j=0;j<4;j++) {
    if(parity(rows[j]&x))output|=1<<j;
  }
  return output;
}

/** @param {number} encoded @returns {number[]} */
function matrixRows(encoded) {
  return [encoded&15,(encoded>>>4)&15,(encoded>>>8)&15,(encoded>>>12)&15];
}

/**
 * @param {number[]} outputs exact A-image indexed by each 4-bit input
 * @param {number} prefix
 * @param {number} u=A^-1(e_2)
 * @returns {(input:number)=>number}
 */
function conjugatedRareOracle(outputs,prefix,u) {
  return input=>(input^((outputs[input]&3)===prefix?u:0))&15;
}

/**
 * Candidate first-step global scalar output masks can be selected from
 * public chosen queries only. We additionally test a specific one-query
 * adaptive strategy: call F(0); if the rare gate is observed, extract its
 * output displacement u and choose any nonzero scalar orthogonal to u.
 * Otherwise return fixed candidate mask 1.
 *
 * @returns {{matrices:number,sources:number,permutations:number,
 *   nonlinearSecondDifferences:number,validMasksPerSource:number,
 *   fixedMaskValidSources:number,oneProbeHits:number,
 *   oneProbeSuccessfulSelections:number,oneProbeFailures:number,
 *   oneQueryInverseChecks:number,nonIdentityOracles:number,
 *   masksUniform:boolean,firstMaskSuccessFraction:string,
 *   oneProbeSuccessFraction:string}}
 */
function runExactConjugatedCensus() {
  let matrices=0,sources=0,permutations=0,nonlinearSecondDifferences=0;
  let fixedMaskValidSources=0,oneProbeHits=0;
  let oneProbeSuccessfulSelections=0,oneProbeFailures=0;
  let oneQueryInverseChecks=0,nonIdentityOracles=0;
  const perMask=new Uint32Array(16);

  for(let encoded=0;encoded<65536;encoded++) {
    const rows=matrixRows(encoded);
    const outputs=Array.from({length:16},(_,x)=>multiplyRows(rows,x));
    if(new Set(outputs).size!==16)continue;
    matrices++;

    /** @type {number[]} */
    const inverse=Array(16).fill(0);
    for(let x=0;x<16;x++)inverse[outputs[x]]=x;
    const u=inverse[4];
    const h0=inverse[1],h1=inverse[2];
    assert.ok(u>0&&h0>0&&h1>0);
    let orthogonal=0;
    for(let w=1;w<16;w++) {
      if(parity(w&u)===0)orthogonal++;
    }
    assert.equal(orthogonal,7,
      'Every nonzero 4-bit direction has seven nonzero orthogonal masks');

    for(let prefix=0;prefix<4;prefix++) {
      const oracle=conjugatedRareOracle(outputs,prefix,u);
      const image=new Set(Array.from({length:16},(_,x)=>oracle(x)));
      if(image.size===16)permutations++;
      let nonFixedTargets=0;
      for(let target=0;target<16;target++) {
        const preimage=oracle(target); // one chosen query at the target
        assert.equal(oracle(preimage),target,
          'Conjugated rare source must invert itself at every target');
        if(preimage!==target)nonFixedTargets++;
        oneQueryInverseChecks++;
      }
      assert.equal(nonFixedTargets,4,
        'Each width-four prefix selects exactly four nonfixed targets');
      if(nonFixedTargets>0)nonIdentityOracles++;
      const second=oracle(0)^oracle(h0)^oracle(h1)^oracle(h0^h1);
      if(second===u)nonlinearSecondDifferences++;

      for(let w=1;w<16;w++) {
        if(parity(w&u)===0)perMask[w]++;
      }
      if(parity(u&1)===0)fixedMaskValidSources++;

      // Under the baseline identity oracle, this always returns 0. The
      // query's only possible nonzero answer exposes the entire hidden u.
      const observed=oracle(0);
      const detected=observed!==0;
      if(detected) {
        oneProbeHits++;
        assert.equal(observed,u);
      }
      let selectedMask=1;
      if(detected) {
        for(let w=1;w<16;w++) {
          if(parity(w&observed)===0) {selectedMask=w;break;}
        }
      }
      if(parity(selectedMask&u)===0)oneProbeSuccessfulSelections++;
      else oneProbeFailures++;
      sources++;
    }
  }

  const expectedFixed=7*(sources/15);
  const masksUniform=Array.from(perMask).slice(1)
    .every(count=>count===expectedFixed);
  assert.equal(matrices,20160,
    'GL(4,2) contains 20,160 invertible binary matrices');
  assert.equal(sources,80640,
    'Four source prefixes per hidden invertible matrix');
  assert.equal(permutations,sources);
  assert.equal(nonlinearSecondDifferences,sources);
  assert.equal(oneQueryInverseChecks,16*sources);
  assert.equal(nonIdentityOracles,sources);
  assert.equal(fixedMaskValidSources,expectedFixed);
  assert.equal(oneProbeHits,sources/4);
  assert.equal(oneProbeSuccessfulSelections,(3*sources)/5);
  assert.equal(oneProbeFailures,(2*sources)/5);
  assert.equal(masksUniform,true);

  return {
    matrices,sources,permutations,nonlinearSecondDifferences,
    validMasksPerSource:7,fixedMaskValidSources,
    oneProbeHits,oneProbeSuccessfulSelections,oneProbeFailures,
    oneQueryInverseChecks,nonIdentityOracles,
    masksUniform,firstMaskSuccessFraction:'7/15',
    oneProbeSuccessFraction:'3/5'
  };
}

if(require.main===module) {
  process.stdout.write('CONJUGATED_RARE_FLAG_CENSUS '+
    JSON.stringify(runExactConjugatedCensus())+'\n');
}
module.exports={runExactConjugatedCensus};
