'use strict';

const assert=require('node:assert/strict');

/** @param {number[]} vectors @param {number} vector @returns {boolean} */
function independent(vectors,vector) {
  let span=[0];
  for(const source of vectors)span=[...span,...span.map(value=>value^source)];
  return !span.includes(vector);
}

/** @param {number} width @returns {number[][]} */
function orderedBases(width) {
  const limit=1<<width;
  /** @type {number[][]} */
  const result=[];
  /** @param {number[]} prefix @returns {void} */
  function visit(prefix){
    if(prefix.length===width){result.push(prefix);return;}
    for(let value=1;value<limit;value++){
      if(independent(prefix,value))visit([...prefix,value]);
    }
  }
  visit([]);
  return result;
}

/** @param {number[]} values @param {number} offset @param {(mapping:number[])=>void} visit @returns {void} */
function permute(values,offset,visit){
  if(offset===values.length){visit(values);return;}
  for(let index=offset;index<values.length;index++){
    [values[index],values[offset]]=[values[offset],values[index]];
    permute(values,offset+1,visit);
    [values[index],values[offset]]=[values[offset],values[index]];
  }
}

/**
 * Find a simultaneous input/output basis using only one chosen forward
 * evaluation per previously unqueried input. A suitable next vector always
 * exists because two size-2^k forbidden sets both contain the zero vector.
 * @param {number[]} mapping Complete finite-table oracle used only by verifier
 * @param {number} width
 * @returns {{basis:number[],distinctCalls:number,minGoodChoices:number}}
 */
function greedyCommonBasis(mapping,width){
  const limit=1<<width;
  /** @type {number[]} */
  const input=[];
  /** @type {number[]} */
  const output=[];
  /** @type {Set<number>} */
  const seen=new Set([0]);
  let minGoodChoices=limit;
  for(let depth=0;depth<width;depth++){
    let goodChoices=0;
    let selected=0;
    for(let value=1;value<limit;value++){
      if(independent(input,value) &&
         independent(output,mapping[value]^mapping[0])){
        goodChoices++;
        if(selected===0)selected=value;
      }
    }
    const lowerBound=limit-(1<<(depth+1))+1;
    assert.ok(goodChoices>=lowerBound,
      'Forbidden-subspace counting lower bound '+width+'/'+depth);
    minGoodChoices=Math.min(minGoodChoices,goodChoices);
    assert.notEqual(selected,0,'A common basis must always extend');
    // An online implementation would choose the first admissible value.
    // Count only distinct oracle inputs inspected up through that value.
    for(let value=1;value<=selected;value++)seen.add(value);
    input.push(selected);
    output.push(mapping[selected]^mapping[0]);
  }
  assert.equal(input.length,width);
  assert.ok(independent([],input[0]));
  return {basis:input,distinctCalls:seen.size,minGoodChoices};
}

/** @param {number[]} mapping @param {number[][]} bases @returns {number} */
function commonBasisCount(mapping,bases){
  let accepted=0;
  const zero=mapping[0];
  for(const basis of bases){
    /** @type {number[]} */
    const values=[];
    let good=true;
    for(const index of basis){
      const result=mapping[index]^zero;
      if(!independent(values,result)){good=false;break;}
      values.push(result);
    }
    if(good)accepted++;
  }
  return accepted;
}

/** @param {number} seed @returns {(bound:number)=>number} */
function random(seed){
  let state=seed>>>0;
  return bound=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)%bound;
  };
}

/** @returns {void} */
function main(){
  const bases3=orderedBases(3);
  const bases4=orderedBases(4);
  assert.equal(bases3.length,168);
  assert.equal(bases4.length,20160);
  /** @type {Map<number,number>} */
  const histogram=new Map();
  let width3Count=0;
  let worstGreedyQueries3=0;
  permute([0,1,2,3,4,5,6,7],1,mapping=>{
    width3Count++;
    const accepted=commonBasisCount(mapping,bases3);
    histogram.set(accepted,(histogram.get(accepted)??0)+1);
    const greedy=greedyCommonBasis(mapping,3);
    assert.equal(greedy.basis.length,3);
    worstGreedyQueries3=Math.max(worstGreedyQueries3,greedy.distinctCalls);
  });
  assert.equal(width3Count,5040);
  const distribution=Object.fromEntries([...histogram.entries()].sort((a,b)=>a[0]-b[0]));
  assert.deepEqual(distribution,{'126':1344,'132':2352,'144':1176,'168':168});
  const pick=random(20261122);
  let minimum4=bases4.length;
  let maximum4=0;
  let worstGreedyQueries4=0;
  const count4=1500;
  for(let attempt=0;attempt<count4;attempt++){
    const mapping=Array.from({length:16},(_,index)=>index);
    for(let i=15;i>1;i--){
      const j=1+pick(i);
      [mapping[i],mapping[j]]=[mapping[j],mapping[i]];
    }
    const accepted=commonBasisCount(mapping,bases4);
    minimum4=Math.min(minimum4,accepted);
    maximum4=Math.max(maximum4,accepted);
    const greedy=greedyCommonBasis(mapping,4);
    worstGreedyQueries4=Math.max(worstGreedyQueries4,greedy.distinctCalls);
  }
  assert.ok(minimum4>0);
  console.log('COMMON_BASIS_PEERCHECK '+JSON.stringify({
    width3:{permutations:width3Count,totalOrderedBases:bases3.length,
      histogram:distribution,worstGreedyQueries:worstGreedyQueries3},
    width4:{seed:20261122,samples:count4,totalOrderedBases:bases4.length,
      minCommonBases:minimum4,maxCommonBases:maximum4,
      worstGreedyQueries:worstGreedyQueries4}
  }));
}

if(require.main===module)main();
module.exports={main,orderedBases,greedyCommonBasis,commonBasisCount};
