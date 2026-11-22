'use strict';

const {invertRankOneShear}=require('./compatible-rank-one-shear-two-sided-inversion');
const {
  invertLinearSandwich,makeTriangularCompatiblePermutation,makeRivestPermutation
}=require('./compatible-permutation-linear-sandwich-blackbox');
const {fixture:priorFixture}=require('./sandwich-cegar-validation-sweep');
const {fixture:hardFixture}=require('./sandwich-cegar-hard-family-stress');

/**
 * Source-agnostic target-inversion portfolio.
 *
 * Every attempt receives the same externally supplied chosen oracle, target,
 * and attacker-controlled RNG seed. It tries a rank-one linear-interpolation
 * inverse and checks the oracle on the returned candidate. If that attempt
 * cannot be verified, it tries the short CEGAR inverter, then its historical
 * full validation version. All attempts share one cache of actual chosen
 * queries. No private input/output map, family discriminator, or secret enters
 * the attack function.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} seed
 * @returns {{value:number|null,queryCount:number,method:string|null,errors:string[]}}
 */
function invertPortfolio(oracle,target,seed){
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    const key=input>>>0;
    const found=cache.get(key);
    if(found!==undefined)return found;
    const output=oracle(key)>>>0;
    cache.set(key,output);
    return output;
  };
  /** @type {[string,()=>{value:number}][]} */
  const attempts=[
    ['rank-one-interpolation',()=>invertRankOneShear(query,target)],
    ['cegar-eight-check',()=>invertLinearSandwich(query,target,seed,
      {validationTrials:8})],
    ['cegar-historical-128',()=>invertLinearSandwich(query,target,seed)]
  ];
  /** @type {string[]} */
  const errors=[];
  for(const [method,attempt] of attempts){
    try{
      const candidate=attempt().value>>>0;
      if(query(candidate)===(target>>>0)){
        return{value:candidate,queryCount:cache.size,method,errors};
      }
      errors.push(method+': candidate mismatched published target');
    }catch(error){
      errors.push(method+': '+(error instanceof Error?error.message:String(error)));
    }
  }
  return{value:null,queryCount:cache.size,method:null,errors};
}

/** @param {number[]} values @returns {number|null} */
function median(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

/**
 * @typedef {{oracle:(input:number)=>number,target:number,secret:number,attackSeed:number}} OracleFixture
 */

/** @returns {void} */
function main(){
  /** @type {{name:string,make:(index:number)=>OracleFixture}[]} */
  const families=[
    ...['rivest-degree-15','triangular-degree-3','triangular-degree-4',
      'sparse-forced-top-bit'].map(name=>{
      /** @param {number} index @returns {OracleFixture} */
      const make=index=>hardFixture(name,index);
      return {name,make};
    }),
    {name:'nonlinear-triangular',make:index=>priorFixture({
      name:'nonlinear-triangular',make:makeTriangularCompatiblePermutation
    },index)},
    {name:'rivest-degree-3',make:index=>priorFixture({
      name:'rivest-degree-3',make:seed=>makeRivestPermutation(3,seed)
    },index)},
    {name:'rivest-degree-7',make:index=>priorFixture({
      name:'rivest-degree-7',make:seed=>makeRivestPermutation(7,seed)
    },index)}
  ];
  const firstIndex=24,lastIndexExclusive=96;
  const rows=[];
  for(const family of families){
    /** @type {Record<string,number>} */
    const methods={};
    /** @type {number[]} */
    const queryCounts=[];
    /** @type {{index:number,queries:number,errors:string[]}[]} */
    const unresolved=[];
    for(let index=firstIndex;index<lastIndexExclusive;index++){
      const item=family.make(index);
      // Public attacker-chosen seed is fixed across all hidden source cases.
      // It carries no fixture-derived knowledge about private map generation.
      const attack=invertPortfolio(item.oracle,item.target,0x510e527f);
      if(attack.value!==null && item.oracle(attack.value)!==item.target){
        throw new Error('Non-matching accepted target '+family.name+':'+index);
      }
      if(attack.value!==item.secret){
        unresolved.push({index,queries:attack.queryCount,errors:attack.errors});
        continue;
      }
      const method=/** @type {string} */(attack.method);
      methods[method]=(methods[method]??0)+1;
      queryCounts.push(attack.queryCount);
    }
    rows.push({
      family:family.name,heldoutCases:lastIndexExclusive-firstIndex,
      exact:queryCounts.length,methods,medianDistinctQueries:median(queryCounts),
      minDistinctQueries:queryCounts.length?Math.min(...queryCounts):null,
      maxDistinctQueries:queryCounts.length?Math.max(...queryCounts):null,
      unresolved
    });
  }
  console.log(JSON.stringify({
    experiment:'Precommitted source-agnostic oracle-only target inversion portfolio',
    firstIndex,lastIndexExclusive,
    attackOrder:['rank-one interpolation','CEGAR validation8','CEGAR validation128'],
    actualQueryCost:'One outer memo of distinct chosen inputs shared across all attempts',
    sourceKnowledge:'Only the experiment fixture knows its source family and true secret; attack RNG seed is the same public constant for every fixture',
    scope:'Failure records retained; no universal solver theorem for interacting shears',
    rows
  },null,2));
}

if(require.main===module)main();
module.exports={invertPortfolio,main};
