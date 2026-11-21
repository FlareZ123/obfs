'use strict';

const assert=require('node:assert/strict');

/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input){
  let value=0;
  for(let i=0;i<columns.length;i++)if((input>>>i)&1)value^=columns[i];
  return value;
}

/** @param {number[]} columns @returns {number} */
function rank3(columns){
  const pivots=[0,0,0];
  let dimension=0;
  for(const col of columns){
    let x=col;
    for(let bit=2;bit>=0;bit--){
      if(!(x&(1<<bit)))continue;
      if(pivots[bit])x^=pivots[bit];
      else{pivots[bit]=x;dimension++;break;}
    }
  }
  return dimension;
}

/** @param {number} x @param {number} y @param {number} i @param {number} j @returns {number} */
function determinant2(x,y,i,j){
  return (((x>>>i)&1)&((y>>>j)&1))^
    (((x>>>j)&1)&((y>>>i)&1));
}

/**
 * Independently enumerate all width-three vector-valued alternating
 * bilinear forms and their three-pair witness failure counts, then
 * enumerate the full-rank 3-way determinant witness distribution.
 * This validates the exact constants used by the 631-query
 * projected rank-three full-functional cloning theorem.
 * @returns {object}
 */
function main(){
  let forms=0,scalarSharp=0,rankThreeOutputForms=0;
  let pairWitnessChecks=0,tripleWitnessChecks=0;
  let worstNoPair=0,worstNoTriple=0,minWitnessPairs=64;
  let bestNoTriple=512;
  for(let a=0;a<8;a++)for(let b=0;b<8;b++)for(let c=0;c<8;c++){
    if(!a&&!b&&!c)continue;
    /** @param {number} x @param {number} y @returns {number} */
    const B=(x,y)=>{
      let v=0;
      if(determinant2(x,y,0,1))v^=a;
      if(determinant2(x,y,0,2))v^=b;
      if(determinant2(x,y,1,2))v^=c;
      return v;
    };
    let zeroPairs=0,zeroTriples=0;
    for(let x=0;x<8;x++){
      for(let y=0;y<8;y++){
        if(B(x,y)===0)zeroPairs++;
        pairWitnessChecks++;
        for(let z=0;z<8;z++){
          if(B(x,y)===0&&B(x,z)===0&&B(y,z)===0)zeroTriples++;
          tripleWitnessChecks++;
        }
      }
    }
    // A scalar projection of any nonzero vector-valued B has
    // alternating rank precisely two in dimension <=3, so it
    // witnesses at least 24 of the 64 input pairs and at least
    // 336 of the 512 input triples.
    assert.ok(zeroPairs<=40,'A nonzero 3D polar form can miss no more than 40/64 pairs');
    assert.ok(zeroTriples<=176,'The three-pair joint miss probability exceeds 11/32');
    if(zeroPairs===40&&zeroTriples===176)scalarSharp++;
    if(rank3([a,b,c])===3)rankThreeOutputForms++;
    worstNoPair=Math.max(worstNoPair,zeroPairs);
    worstNoTriple=Math.max(worstNoTriple,zeroTriples);
    minWitnessPairs=Math.min(minWitnessPairs,64-zeroPairs);
    bestNoTriple=Math.min(bestNoTriple,zeroTriples);
    forms++;
  }
  assert.equal(forms,511);
  assert.equal(worstNoPair,40);
  assert.equal(worstNoTriple,176);
  assert.equal(minWitnessPairs,24);
  assert.ok(scalarSharp>0);
  assert.ok(rankThreeOutputForms>0);

  let invertibleInputProjections=0,determinantChecks=0;
  let minimumCubics=512,maximumCubics=0;
  for(let a=1;a<8;a++)for(let b=1;b<8;b++)for(let c=1;c<8;c++){
    const V=[a,b,c];
    if(rank3(V)!==3)continue;
    let cubicWitnesses=0;
    for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++){
      const tuple=[apply(V,x),apply(V,y),apply(V,z)];
      if(rank3(tuple)===3)cubicWitnesses++;
      determinantChecks++;
    }
    assert.equal(cubicWitnesses,168,
      'Every invertible hidden 3D projection has exactly 21/64 cubic witnesses');
    minimumCubics=Math.min(minimumCubics,cubicWitnesses);
    maximumCubics=Math.max(maximumCubics,cubicWitnesses);
    invertibleInputProjections++;
  }
  assert.equal(invertibleInputProjections,168);
  const summary={
    claim:'Exact witness failure probabilities for rank<=3 input-projected quadratic/cubic vector forms',
    scalarField:'GF(2)',
    arbitraryVectorOutputForms:forms,
    jointlyCheckedInputPairs:pairWitnessChecks,
    jointlyCheckedInputTriples:tripleWitnessChecks,
    sharpScalarForms:scalarSharp,
    rankThreeVectorOutputForms:rankThreeOutputForms,
    polarPair:{maxZeroPairs:worstNoPair,totalPairs:64,
      minimumNonzeroPairs:minWitnessPairs},
    polarTriple:{maxAllThreePairsZero:worstNoTriple,
      totalTriples:512,minimumAllZeroTripleCount:bestNoTriple,
      maxAllZeroProbability:'176/512 = 11/32'},
    cubicDeterminant:{invertibleInputProjections,determinantChecks,
      nonzeroTriplesPerProjection:minimumCubics,
      maximumNonzeroTriplesPerProjection:maximumCubics,
      witnessProbability:'168/512 = 21/64'},
    cubicMissAfter58:(43/64)**58,
    quadraticMissAfter58:(11/32)**58,
    validity:'Exact finite counting of vector-valued 3D alternating forms and invertible projections, not large-width Monte Carlo'
  };
  console.log(JSON.stringify(summary,null,2));
  return summary;
}
if(require.main===module)main();
module.exports={main};
