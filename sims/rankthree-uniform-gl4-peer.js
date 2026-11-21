'use strict';
const assert=require('node:assert/strict');
const {cloneQuadratic}=require('./rankthree-quadratic-bilinear-shortcut');

/** @param {number[]} vectors @returns {number} */
function rank(vectors){
  const basis=Array(4).fill(0);
  let count=0;
  for(const item of vectors){
    let x=item;
    for(let bit=3;bit>=0;bit--){
      if(!((x>>>bit)&1))continue;
      if(!basis[bit]){basis[bit]=x;count++;break;}
      x^=basis[bit];
    }
  }
  return count;
}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let y=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)y^=columns[i];
  return y>>>0;
}
/** @param {number} x @returns {number} */
function quadratic(x){
  const a=x&1,b=(x>>>1)&1,c=(x>>>2)&1;
  return (a&b)|((a&c)<<1)|((b&c)<<2);
}
/** @param {number} n @param {number} k @returns {bigint} */
function gaussian(n,k){
  if(k<0||k>n)return 0n;
  let numerator=1n,denominator=1n;
  for(let i=0;i<k;i++){
    numerator*=(1n<<BigInt(n-i))-1n;
    denominator*=(1n<<BigInt(k-i))-1n;
  }
  assert.equal(numerator%denominator,0n);
  return numerator/denominator;
}
function main(){
  /** @type {number[]} */
  const columns=[];
  let matrices=0,heldouts=0,early=0,maxCalls=0;
  const projectionSpan=Array(5).fill(0);
  const certificatePivot=Array(5).fill(0);
  /** @returns {void} */
  function enumerate(){
    const k=columns.length;
    if(k===4){
      matrices++;
      for(let index=0;index<=4;index++){
        if(rank(columns.slice(0,index).map(x=>x&7))===3)projectionSpan[index]++;
      }
      let online=true;
      const m=cloneQuadratic(z=>{
        if(!online)throw new Error('Verifier used source after training');
        return quadratic(apply(columns,z));
      },4,3);
      online=false;
      for(let x=0;x<16;x++){
        assert.equal(m.evaluate(x),quadratic(apply(columns,x)));
        heldouts++;
      }
      if(m.early)early++;
      certificatePivot[m.pivots]++;
      maxCalls=Math.max(maxCalls,m.queries);
      return;
    }
    for(let v=1;v<16;v++){
      if(rank([...columns,v])!==k+1)continue;
      columns.push(v);
      enumerate();
      columns.pop();
    }
  }
  enumerate();
  assert.equal(matrices,20160);
  assert.equal(heldouts,322560);
  const predicted3=(gaussian(1,0)*8n*BigInt(matrices)/gaussian(4,3));
  assert.equal(predicted3,10752n);
  assert.equal(projectionSpan[3],Number(predicted3));
  assert.equal(projectionSpan[4],matrices);
  // For this full wedge-output rank-3 B, two independent quotient vectors
  // already give an injective joint polarization signature.
  const predictedTwo=BigInt(matrices)*4n/5n;
  assert.equal(certificatePivot[2],Number(predictedTwo));
  assert.equal(certificatePivot[3],matrices-Number(predictedTwo));
  console.log('UNIFORM_GL4_ORACLE '+JSON.stringify({
    matrices,heldouts,early,maxCalls,projectionSpan,certificatePivot,
    predictedTwo:Number(predictedTwo),formalProbability2:'4/5',
    predicted3:Number(predicted3),formalProbability3:'8/15',
    note:'Uniform enumeration of all invertible 4x4 binary matrices; quotient projection uses first three input coordinates'
  }));
}
if(require.main===module)main();
module.exports={main};
