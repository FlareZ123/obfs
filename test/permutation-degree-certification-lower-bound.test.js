'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  adaptivePermutationTranscript,exactVectorAnfDegree,swapIdentityOutputs,
  hiddenSwapDegreeWitness,compatibleHighestBitGate,compatibleDegreeWitness,
  reconstructKnownCompatiblePermutation
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


test('known-coordinate compatible degree certificate needs exactly one query per lower prefix',()=>{
  let verified=0;
  for(let bits=3;bits<=10;bits++) {
    const high=2**(bits-1);
    for(const count of [0,1,Math.floor(high/3),high-1]) {
      const witness=compatibleDegreeWitness(bits,count);
      assert.equal(witness.referenceDegree,1);
      assert.equal(witness.alternateDegree,bits-1);
      assert.equal(witness.alternateBijection,true);
      assert.equal(witness.transcriptEqual,true);
      assert.ok(witness.unseenPrefixes>=1);
      assert.equal(witness.prefixes,high);
      assert.ok(witness.chosenPrefix>=0&&witness.chosenPrefix<high);
      verified++;
    }
  }
  assert.equal(verified,32);
  console.log('KNOWN_COMPATIBLE_DEGREE_CERTIFICATE '+JSON.stringify({
    trials:verified,largestExhaustiveWidth:10,
    requiredOracleQueriesAt32Bits:2**31
  }));
});

test('one observation per lower prefix reconstructs every width-3 compatible permutation',()=>{
  // P_0=x_0 XOR constant, P_1=x_1 XOR h_1(x_0), and
  // P_2=x_2 XOR h_2(x_0,x_1). Count 2*4*16=128 permutations.
  for(let low=0;low<2;low++)for(let mid=0;mid<4;mid++)for(let top=0;top<16;top++) {
    /** @param {number} x @returns {number} */
    function P(x) {
      const first=x&1,second=(x>>>1)&1,third=(x>>>2)&1;
      return (first^low)|
        ((second^((mid>>>first)&1))<<1)|
        ((third^((top>>>(x&3))&1))<<2);
    }
    let observed=0;
    const reconstructed=reconstructKnownCompatiblePermutation(x=>{
      observed++;
      return P(x);
    },3);
    assert.equal(observed,4);
    assert.equal(reconstructed.queries,4);
    for(let x=0;x<8;x++)assert.equal(reconstructed.table[x],P(x));
  }
});

test('one-per-prefix interpolation recovers randomized full-width high-bit gates',()=>{
  for(let bits=3;bits<=10;bits++) {
    const upper=2**(bits-1);
    for(let sample=0;sample<Math.min(upper,16);sample++) {
      const prefix=(Math.imul(sample+7,1315423911)&(upper-1))>>>0;
      const P=compatibleHighestBitGate(bits,prefix);
      const reconstructed=reconstructKnownCompatiblePermutation(P,bits);
      for(let x=0;x<2**bits;x++)
        assert.equal(reconstructed.table[x],P(x));
    }
  }
});

test('invalid query caps and degenerate swap points are rejected',()=>{
  assert.throws(()=>hiddenSwapDegreeWitness(8,255),/at most 2\^bits-2/);
  assert.throws(()=>adaptivePermutationTranscript(()=>0,2,1),/bits 3..12/);
  assert.throws(()=>swapIdentityOutputs(0,0),/distinct unsigned/);
});
