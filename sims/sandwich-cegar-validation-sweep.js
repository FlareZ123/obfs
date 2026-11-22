'use strict';

const {
  invertLinearSandwich,makeRng,makeLinearTransform,applyLinear,
  makeTriangularCompatiblePermutation,makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/** @type {{name:string,make:(seed:number)=>(value:number)=>number}[]} */
const families=[
  {name:'nonlinear-triangular',make:makeTriangularCompatiblePermutation},
  {name:'rivest-degree-3',make:seed=>makeRivestPermutation(3,seed)},
  {name:'rivest-degree-7',make:seed=>makeRivestPermutation(7,seed)}
];
const budgets=[0,4,8,16,32,64,128];
const casesPerFamily=32;

/** @param {number[]} values @returns {number|null} */
function median(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[index]:(sorted[index-1]+sorted[index])/2;
}

/**
 * This reproduces the previously published synthetic source family and
 * attacker seed exactly. The attacker receives only oracle(x) and target.
 *
 * @param {typeof families[number]} family
 * @param {number} index
 * @returns {{oracle:(x:number)=>number,target:number,secret:number,attackSeed:number}}
 */
function fixture(family,index){
  const salt=family.name.split('').reduce(
    (value,ch)=>u32(Math.imul(value^ch.charCodeAt(0),0x01000193)),0x811c9dc5);
  const seed=u32(0x6a09e667^salt^index);
  const permutation=family.make(seed);
  const inner=makeLinearTransform(seed^0xbb67ae85);
  const outer=makeLinearTransform(seed^0x3c6ef372);
  /** @param {number} x @returns {number} */
  const oracle=x=>applyLinear(outer,permutation(applyLinear(inner,x)));
  const secret=makeRng(seed^0xa54ff53a)();
  // Historical paired-query schedule: this seed is reproducibly related to
  // private source generation. The separate source-agnostic portfolio uses
  // an attacker-chosen fixed seed rather than this fixture-related value.
  return {oracle,target:oracle(secret),secret,attackSeed:seed^0x510e527f};
}

/** @returns {void} */
function main(){
  const rows=[];
  for(const family of families){
    const inputs=Array.from({length:casesPerFamily},(_,index)=>fixture(family,index));
    /** @type {Map<number,number[]>} */
    const successfulQueryCounts=new Map();
    const baseline=[];
    for(const budget of budgets){
      let solved=0,failures=0,refinements=0;
      /** @type {number[]} */
      const queries=[];
      /** @type {{case:number,error:string}[]} */
      const failedCases=[];
      for(let index=0;index<inputs.length;index++){
        const item=inputs[index];
        try{
          const trial=invertLinearSandwich(item.oracle,item.target,item.attackSeed,
            {validationTrials:budget});
          if(trial.value!==item.secret)throw new Error('Recovered wrong preimage');
          solved++;
          refinements+=trial.refinements;
          queries.push(trial.queryCount);
          if(budget===128)baseline[index]=trial.queryCount;
        }catch(error){
          failures++;
          failedCases.push({
            case:index,
            error:error instanceof Error?error.message:String(error)
          });
        }
      }
      successfulQueryCounts.set(budget,queries);
      rows.push({
        family:family.name,validationTrials:budget,cases:casesPerFamily,
        solved,failures,medianSuccessfulQueries:median(queries),
        minSuccessfulQueries:queries.length?Math.min(...queries):null,
        maxSuccessfulQueries:queries.length?Math.max(...queries):null,
        totalSuccessfulRefinements:refinements,
        failedCases
      });
    }
    if(baseline.length!==casesPerFamily) {
      throw new Error('Historical 128-check baseline no longer recovers all '+family.name+' targets');
    }
  }
  console.log(JSON.stringify({
    model:'Two-sided 32-bit affine sandwich, predeclared CEGAR validation-budget ablation',
    source:'The unchanged published synthetic 3-family oracle corpus and seed derivation',
    casesPerFamily,budgets,
    oracleBudget:'Distinct chosen inputs per attempt; excludes published target evaluation',
    guarantee:'Empirical seed-known source-family test only; no universal correctness or secrecy theorem',
    rows
  },null,2));
}

if(require.main===module)main();
module.exports={fixture,median,main};
