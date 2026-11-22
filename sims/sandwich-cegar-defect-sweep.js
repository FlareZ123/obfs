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
const defectSamplesGrid=[2,4,8,16,32];
const trainStart=0,trainEnd=32;
const heldoutStart=128,heldoutEnd=224;
const validationTrials=8;

/** @param {number[]} values @returns {number} */
function mean(values){
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

/**
 * @param {(value:number)=>number} oracle
 * @param {number} target
 * @param {number} attackSeed
 * @param {number} shortSamples
 * @returns {{value:number,queryCount:number,fallback:boolean,shortError:string|null}}
 */
function invertWithFallback(oracle,target,attackSeed,shortSamples){
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  const memo=input=>{
    const x=input>>>0;
    const found=cache.get(x);
    if(found!==undefined)return found;
    const value=oracle(x);
    cache.set(x,value);
    return value;
  };
  try{
    const short=invertLinearSandwich(memo,target,attackSeed,
      {validationTrials,defectSamples:shortSamples});
    if(memo(short.value)!==target)throw new Error('Short-budget target mismatch');
    return {value:short.value,queryCount:cache.size,fallback:false,shortError:null};
  }catch(error){
    const shortError=error instanceof Error?error.message:String(error);
    const complete=invertLinearSandwich(memo,target,attackSeed);
    if(memo(complete.value)!==target)throw new Error('Fallback target mismatch');
    return {
      value:complete.value,queryCount:cache.size,fallback:true,shortError
    };
  }
}

/** @returns {void} */
function main(){
  /** @type {{defectSamples:number,solved:number,cases:number,meanSuccessfulQueries:number|null,failed:string[]}[]} */
  const training=[];
  for(const defectSamples of defectSamplesGrid){
    let solved=0;
    /** @type {number[]} */
    const queryCounts=[];
    /** @type {string[]} */
    const failed=[];
    for(const family of families){
      for(let index=trainStart;index<trainEnd;index++){
        const item=fixture(family,index);
        try{
          const result=invertLinearSandwich(item.oracle,item.target,item.attackSeed,
            {validationTrials,defectSamples});
          if(result.value!==item.secret)throw new Error('Recovered wrong target preimage');
          solved++;
          queryCounts.push(result.queryCount);
        }catch(error){
          failed.push(family.name+':'+index+':'+
            (error instanceof Error?error.message:String(error)));
        }
      }
    }
    training.push({
      defectSamples,solved,cases:families.length*(trainEnd-trainStart),
      meanSuccessfulQueries:queryCounts.length?mean(queryCounts):null,failed
    });
  }

  // Fixed training selection criterion: among 100%-recovered candidates,
  // select the fewest mean distinct oracle calls. The 32-sample setting is
  // the previously checked 8-validation safe fallback on this training set.
  const candidates=training.filter(row=>row.solved===row.cases);
  if(!candidates.length)throw new Error('No complete training candidate');
  const chosen=candidates.sort((a,b)=>
    /** @type {number} */(a.meanSuccessfulQueries)-
      /** @type {number} */(b.meanSuccessfulQueries))[0].defectSamples;

  const rows=[];
  for(const family of families){
    /** @type {number[]} */
    const adaptiveCounts=[];
    /** @type {number[]} */
    const baselineCounts=[];
    /** @type {{index:number,shortError:string,queries:number}[]} */
    const fallbackCases=[];
    for(let index=heldoutStart;index<heldoutEnd;index++){
      const item=fixture(family,index);
      const adaptive=invertWithFallback(item.oracle,item.target,item.attackSeed,chosen);
      const baseline=invertLinearSandwich(item.oracle,item.target,item.attackSeed);
      if(adaptive.value!==item.secret||baseline.value!==item.secret) {
        throw new Error('Held-out target mismatch: '+family.name+':'+index);
      }
      adaptiveCounts.push(adaptive.queryCount);
      baselineCounts.push(baseline.queryCount);
      if(adaptive.fallback)fallbackCases.push({
        index,shortError:adaptive.shortError??'unknown',queries:adaptive.queryCount
      });
    }
    rows.push({
      family:family.name,cases:adaptiveCounts.length,
      adaptiveMedianQueries:median(adaptiveCounts),
      baselineMedianQueries:median(baselineCounts),
      medianAdaptiveOverBaseline:
        /** @type {number} */(median(adaptiveCounts))/
        /** @type {number} */(median(baselineCounts)),
      adaptiveMaxQueries:Math.max(...adaptiveCounts),
      baselineMaxQueries:Math.max(...baselineCounts),
      fallbackCount:fallbackCases.length,fallbackCases
    });
  }
  console.log(JSON.stringify({
    experiment:'Adaptive validation-defect sampling ablation for two-sided 32-bit compatible sandwiches',
    firstSourceSeedRange:[trainStart,trainEnd],
    heldoutSeedRange:[heldoutStart,heldoutEnd],
    validationTrials,defectSamplesGrid,
    selectionRule:'Lowest mean oracle queries among settings exactly inverting all training targets',
    chosenDefectSamples:chosen,
    baseline:'Unchanged 32 defect samples and 128 validation checks',
    scope:'Source-family oracle inversion only; no universal permutation claim',
    training,rows
  },null,2));
}

if(require.main===module)main();
module.exports={invertWithFallback,main};
