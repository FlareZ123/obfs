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
/** @param {number[]} vectors @returns {number} */
function fullRank8(vectors){
  const pivots=Array(8).fill(0);
  let count=0;
  for(let value of vectors){
    for(let bit=7;bit>=0;bit--){
      if(!((value>>>bit)&1))continue;
      if(pivots[bit])value^=pivots[bit];
      else{pivots[bit]=value;count++;break;}
    }
  }
  return count;
}
/** @returns {{promised:number,promiseViolated:number,promisedOfflineChecks:number,outsideRejected:number,outsideSilentlyWrong:number}} */
function verifyPromiseBoundary(){
  const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  let promised=0,promiseViolated=0,promisedOfflineChecks=0;
  let outsideRejected=0,outsideSilentlyWrong=0;
  for(let encoded=0;encoded<4096;encoded++){
    const coeff=pairs.map((_,i)=>(encoded>>>(2*i))&3);
    const fullSignature=Array.from({length:4},(_,i)=>
      pairs.reduce((value,[a,b],j)=>
        value^((a===i)?coeff[j]<<(2*b):((b===i)?coeff[j]<<(2*a):0)),0));
    const fullRank=fullRank8(fullSignature);
    /** @param {number} x @returns {number} */
    const oracle=x=>{
      let value=(x^(x>>>2)^encoded)&3;
      for(let j=0;j<pairs.length;j++){
        const [a,b]=pairs[j];
        if(((x>>>a)&1)&&((x>>>b)&1))value^=coeff[j];
      }
      return value>>>0;
    };
    if(fullRank<=3){
      let online=true;
      const model=cloneQuadratic(x=>{
        if(!online)throw Error('Promised clone used source after training');
        return oracle(x);
      },4,3);
      online=false;
      for(let x=0;x<16;x++){
        assert.equal(model.evaluate(x),oracle(x));
        promisedOfflineChecks++;
      }
      promised++;
    }else{
      promiseViolated++;
      let model;
      try{model=cloneQuadratic(oracle,4,3);}
      catch(error){
        assert.match(String(error),/rank/u);
        outsideRejected++;
        continue;
      }
      const mismatch=Array.from({length:16},(_,x)=>x)
        .some(x=>model.evaluate(x)!==oracle(x));
      if(mismatch)outsideSilentlyWrong++;
      else throw Error('Unexpected full-rank model reproduces all outputs');
    }
  }
  assert.equal(promised,736);
  assert.equal(promiseViolated,3360);
  assert.equal(promisedOfflineChecks,11776);
  assert.equal(outsideRejected+outsideSilentlyWrong,promiseViolated);
  return {promised,promiseViolated,promisedOfflineChecks,
    outsideRejected,outsideSilentlyWrong};
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
  const promiseBoundary=verifyPromiseBoundary();
  console.log('UNIFORM_GL4_ORACLE '+JSON.stringify({
    matrices,heldouts,early,maxCalls,projectionSpan,certificatePivot,promiseBoundary,
    predictedTwo:Number(predictedTwo),formalProbability2:'4/5',
    predicted3:Number(predicted3),formalProbability3:'8/15',
    note:'Uniform enumeration of all invertible 4x4 binary matrices; quotient projection uses first three input coordinates'
  }));
}
if(require.main===module)main();
module.exports={main};
