'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {recover,makeRandom,makeOracle,main} =
  require('../sims/affine-lowrank-permutation-inversion');

/** @param {number[]} source @returns {number[][]} */
function allPermutations(source) {
  if(!source.length)return [[]];
  /** @type {number[][]} */
  const permutations=[];
  for(const value of source) {
    for(const tail of allPermutations(source.filter(item=>item!==value)))
      permutations.push([value,...tail]);
  }
  return permutations;
}

test('affine low-rank oracle recovery matches 155200 seeded targets',()=>{
  main();
});

test('all 576 within-coset bijections on two three-bit fibers invert at every target',()=>{
  const permutations=allPermutations([0,1,2,3]);
  let cases=0;
  for(const left of permutations) {
    for(const right of permutations) {
      const maps=[left,right];
      /** @param {number} x */
      const oracle=x=>(x&4)|maps[x>>>2][x&3];
      const random=makeRandom(0x5f385b71^cases);
      for(let y=0;y<8;y++) {
        const result=recover(oracle,y,3,2,random);
        assert.equal(oracle(result.x),y);
        assert.ok(result.cycleSteps<=4);
        assert.ok(result.deficiency<=2);
      }
      cases++;
    }
  }
  assert.equal(cases,576);
});

test('sparse nonlinear fiber edits preserve the inversion bound',()=>{
  const F=makeOracle(12,4,0x8e51cd9a,'sparse');
  const random=makeRandom(0x195ac8e2);
  for(let i=0;i<256;i++) {
    const y=random()%4096;
    const result=recover(F,y,12,4,random);
    assert.equal(F(result.x),y);
    assert.ok(result.cycleSteps<=16);
  }
});
