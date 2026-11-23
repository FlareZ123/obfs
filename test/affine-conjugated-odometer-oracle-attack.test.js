'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeRandomInvertibleMatrix,makeConjugatedOdometer,recoverConjugator,
  invertTarget,runExperiment}=require('../sims/affine-conjugated-odometer-oracle-attack');

test('n chosen forward queries recover the exact hidden linear conjugator at widths 8,16,32,64',()=>{
  for(const width of [8,16,32,64])for(let seed=1;seed<=5;seed++){
    const result=runExperiment(width,seed,20);
    assert.equal(result.queries,width);
    assert.equal(result.matrixRecovered,true);
    assert.equal(result.targetsInverted,true);
  }
});

test('the adaptive query chain exposes each inverse-matrix column directly',()=>{
  const width=32,matrix=makeRandomInvertibleMatrix(width,0x12345678);
  const oracle=makeConjugatedOdometer(matrix,width);
  const recovered=recoverConjugator(oracle,width);
  assert.deepEqual(recovered.inverseRows,matrix.inverseRows);
  assert.equal(recovered.queries,width);
  const target=0x9a123457n;
  const preimage=invertTarget(target,recovered,width);
  assert.equal(oracle(preimage),target);
});

test('the eight-bit conjugated incrementer retains algebraic degree seven and one full cycle',()=>{
  const width=8,matrix=makeRandomInvertibleMatrix(width,0x87654321);
  const oracle=makeConjugatedOdometer(matrix,width),size=1<<width;
  let maximumDegree=0;
  for(let outputBit=0;outputBit<width;outputBit++){
    const coefficients=Array.from({length:size},(_,x)=>Number((oracle(BigInt(x))>>BigInt(outputBit))&1n));
    for(let inputBit=0;inputBit<width;inputBit++)
      for(let monomial=0;monomial<size;monomial++)
        if(monomial&(1<<inputBit))coefficients[monomial]^=coefficients[monomial^(1<<inputBit)];
    for(let monomial=0;monomial<size;monomial++)if(coefficients[monomial]){
      let weight=0;for(let x=monomial;x;x&=x-1)weight++;
      maximumDegree=Math.max(maximumDegree,weight);
    }
  }
  assert.equal(maximumDegree,width-1);
  let value=0n;
  const seen=new Set();
  for(let step=0;step<size;step++){
    assert.equal(seen.has(value),false);
    seen.add(value);
    value=oracle(value);
  }
  assert.equal(value,0n);
  assert.equal(seen.size,size);
});
