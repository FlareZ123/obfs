'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  adaptivePermutationTranscript,exactVectorAnfDegree,swapIdentityOutputs,
  hiddenSwapDegreeWitness
}=require('../sims/permutation-degree-certification-lower-bound');

test('adaptive output-swap coupling is exact with two arbitrary unseen inputs',()=>{
  let trials=0;
  for(let bits=3;bits<=10;bits++) {
    const total=2**bits;
    for(const count of [0,1,Math.floor(total/3),total-2]) {
      const report=hiddenSwapDegreeWitness(bits,count);
      assert.equal(report.bits,bits);
      assert.equal(report.count,count);
      assert.equal(report.unseen,total-count);
      assert.equal(report.swap.length,2);
      assert.notEqual(report.swap[0],report.swap[1]);
      assert.equal(report.transcriptEqual,true);
      assert.equal(report.identityBijection,true);
      assert.equal(report.alternateBijection,true);
      assert.equal(report.referenceDegree,1);
      assert.equal(report.alternateDegree,bits-1);
      trials++;
    }
  }
  console.log('PERMUTATION_DEGREE_ADAPTIVE_LOWER_BOUND '+JSON.stringify({
    trials,maxExhaustiveWidth:10,
    worstCaseUnseenBeforeExactCertificate:2,
    deterministicWorstCaseRequiredQueriesAtWidth32:2**32-1
  }));
});

test('every hidden output swap of width three and four has exact degree n-1',()=>{
  for(const bits of [3,4]) {
    const total=2**bits;
    for(let first=0;first<total;first++)for(let second=first+1;second<total;second++) {
      const swapped=swapIdentityOutputs(first,second);
      const outputs=new Set(Array.from({length:total},(_,i)=>swapped(i)));
      assert.equal(outputs.size,total,'Swapped identity must remain a permutation');
      assert.equal(exactVectorAnfDegree(swapped,bits),bits-1,
        'Any 2-point swap has Boolean degree exactly n-1');
    }
  }
});

test('permutation guarantee lets all-but-one outputs reconstruct missing result',()=>{
  for(const bits of [3,4,5,6]) {
    const total=2**bits;
    for(const unknown of [0,1,Math.floor(total/2),total-1]) {
      const actual=swapIdentityOutputs(0,total-1);
      let xorInputs=0,xorKnownOutputs=0;
      for(let i=0;i<total;i++) {
        xorInputs^=i;
        if(i!==unknown)xorKnownOutputs^=actual(i);
      }
      assert.equal(xorInputs^xorKnownOutputs,actual(unknown),
        'The permutation property uniquely fixes its last unknown output');
    }
  }
});

test('invalid query caps and degenerate swap points are rejected',()=>{
  assert.throws(()=>hiddenSwapDegreeWitness(8,255),/at most 2\^bits-2/);
  assert.throws(()=>adaptivePermutationTranscript(()=>0,2,1),/bits 3..12/);
  assert.throws(()=>swapIdentityOutputs(0,0),/distinct unsigned/);
});
