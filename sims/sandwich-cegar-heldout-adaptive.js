'use strict';

const {
  invertLinearSandwich,makeTriangularCompatiblePermutation,makeRivestPermutation
}=require('./compatible-permutation-linear-sandwich-blackbox');
const {fixture,median}=require('./sandwich-cegar-validation-sweep');

/** @type {{name:string,make:(seed:number)=>(value:number)=>number}[]} */
const families=[
  {name:'nonlinear-triangular',make:makeTriangularCompatiblePermutation},
  {name:'rivest-degree-3',make:seed=>makeRivestPermutation(3,seed)},
  {name:'rivest-degree-7',make:seed=>makeRivestPermutation(7,seed)}
];

/**
 * A deterministic attacker with a fresh, held-out source and a public target.
 * First try a smaller sample budget. If the final target equality check fails
 * or a mask cannot be found, repeat the unchanged historical attack.
 * A single outer cache counts actual distinct chosen-oracle evaluations.
 *
 * @param {(value:number)=>number} oracle
 * @param {number} target
 * @param {number} attackSeed
 * @returns {{value:number,queryCount:number,fallback:boolean,shortError:string|null}}
 */
function invertAdaptive(oracle,target,attackSeed){
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    const x=input>>>0;
    const cached=cache.get(x);
    if(cached!==undefined)return cached;
    const result=oracle(x);
    cache.set(x,result);
    return result;
  };
  try {
    const result=invertLinearSandwich(query,target,attackSeed,{validationTrials:8});
    if(query(result.value)!==target)throw new Error('Short-budget inverse mismatched target');
    return {value:result.value,queryCount:cache.size,fallback:false,shortError:null};
  }catch(error) {
    const reason=error instanceof Error?error.message:String(error);
    const result=invertLinearSandwich(query,target,attackSeed,{validationTrials:128});
    if(query(result.value)!==target)throw new Error('Full-budget inverse mismatched target');
    return {value:result.value,queryCount:cache.size,fallback:true,shortError:reason};
  }
}

/** @returns {void} */
function main(){
  // Indices [0,31] were used to choose budget=8. These held-out indices
  // [32,127] are predeclared before inspecting their results.
  const heldoutStart=32,heldoutEndExclusive=128;
  const rows=[];
  for(const family of families) {
    /** @type {number[]} */
    const adaptiveQueries=[];
    /** @type {number[]} */
    const controlQueries=[];
    /** @type {{index:number,shortError:string,queries:number}[]} */
    const fallbacks=[];
    for(let index=heldoutStart;index<heldoutEndExclusive;index++){
      const item=fixture(family,index);
      const attack=invertAdaptive(item.oracle,item.target,item.attackSeed);
      const control=invertLinearSandwich(item.oracle,item.target,item.attackSeed,
        {validationTrials:128});
      if(attack.value!==item.secret||control.value!==item.secret) {
        throw new Error('Secret mismatch at '+family.name+' case '+index);
      }
      adaptiveQueries.push(attack.queryCount);
      controlQueries.push(control.queryCount);
      if(attack.fallback)fallbacks.push({
        index,shortError:attack.shortError??'unknown',queries:attack.queryCount
      });
    }
    rows.push({
      family:family.name,heldoutCases:adaptiveQueries.length,
      adaptiveMedianDistinctQueries:median(adaptiveQueries),
      baselineMedianDistinctQueries:median(controlQueries),
      medianRatio:/** @type {number} */(median(adaptiveQueries))/
        /** @type {number} */(median(controlQueries)),
      adaptiveMaxDistinctQueries:Math.max(...adaptiveQueries),
      adaptiveMinDistinctQueries:Math.min(...adaptiveQueries),
      baselineMaxDistinctQueries:Math.max(...controlQueries),
      fallbackCount:fallbacks.length,fallbacks
    });
  }
  console.log(JSON.stringify({
    experiment:'Source-family held-out eight-check CEGAR with exact 128-check fallback',
    sourceIndexRange:[heldoutStart,heldoutEndExclusive],
    budgetSelection:'8 checks selected from 32 earlier source-family examples',
    trustBoundary:'Chosen-query client oracle and published target, with exact target equality check',
    scope:'Synthetic known compatible families; no arbitrary-permutation guarantee',
    rows
  },null,2));
}

if(require.main===module)main();
module.exports={invertAdaptive,main};
