'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  sourceMix,triangularToggle,singularOracle,invertSingularOracle,
  interpolationColumns,censusThreeBitBases
}=require('../sims/reanchor-all-anchor-singular');

test('two involutive bijections compose into a public reversible 3-bit permutation',()=>{
  const outputs=new Set();
  for(let value=0;value<8;value++){
    assert.equal(sourceMix(sourceMix(value)),value);
    assert.equal(triangularToggle(triangularToggle(value)),value);
    const output=singularOracle(value);
    outputs.add(output);
    assert.equal(invertSingularOracle(output),value);
  }
  assert.equal(outputs.size,8);
});

test('all eight anchors have a dependent finite-difference coordinate basis',()=>{
  for(let anchor=0;anchor<8;anchor++) {
    const M=interpolationColumns(singularOracle,anchor,3);
    assert.equal((M[0]^M[1]^M[2])>>>0,0);
    assert.equal(new Set(Array.from({length:8},(_,x)=>
      (x&1?M[0]:0)^(x&2?M[1]:0)^(x&4?M[2]:0))).size,4);
  }
});

test('the same counterexample has singular first-three columns at width 32',()=>{
  for(const anchor of [0,1,2,3,4,5,6,7,0x12345678,0x80000000,0xffffffff]){
    const M=interpolationColumns(singularOracle,anchor,32);
    assert.equal((M[0]^M[1]^M[2])>>>0,0);
    assert.equal(invertSingularOracle(singularOracle(anchor)),anchor>>>0);
    for(let index=3;index<32;index++)
      assert.equal(M[index],(2**index)>>>0);
  }
});

test('independent exhaustive n=3 census includes 1536 universally bad source pairs',()=>{
  assert.deepEqual(censusThreeBitBases(),{
    maps:168,permutations:128,allEight:19968,none:1536,
    mixed:0,singularAnchors:12288
  });
});
