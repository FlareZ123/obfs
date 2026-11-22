'use strict';

const {
  invertLinearSandwich,makeRng,makeLinearTransform,applyLinear,
  makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}

/**
 * A compatible permutation with random degree-k products of lower-bit
 * GF(2)-linear forms. Each output bit toggles its corresponding input bit
 * conditioned on lower bits only, so the whole map is triangular and bijective.
 *
 * @param {number} seed
 * @param {3|4} degree
 * @returns {(input:number)=>number}
 */
function makeTriangularProduct(seed,degree){
  const next=makeRng(seed);
  const specs=Array.from({length:32},(_,bit)=>{
    const mask=bit===0?0:u32(2**bit-1);
    return {
      terms:Array.from({length:degree},()=>next()&mask),
      linear:next()&mask,
      constant:next()&1
    };
  });
  return input=>{
    const x=input>>>0;
    let result=0;
    for(let bit=0;bit<32;bit++){
      const lower=x&(bit===0?0:u32(2**bit-1));
      const spec=specs[bit];
      let nonlinear=1;
      for(const term of spec.terms)nonlinear&=parity32(lower&term);
      const delta=nonlinear^parity32(lower&spec.linear)^spec.constant;
      if((((x>>>bit)&1)^delta)!==0)result=u32(result+2**bit);
    }
    return result;
  };
}

/**
 * Compute the input to a known private linear map for constructing a held-out
 * exceptional target. This inversion stays inside the source fixture and is
 * never available to the chosen-query inverter.
 *
 * @param {number[]} columns
 * @param {number} output
 * @returns {number}
 */
function invertPrivateLinear(columns,output){
  const rows=Array.from({length:32},(_,bit)=>{
    let coefficient=0;
    for(let col=0;col<32;col++){
      if(((columns[col]>>>bit)&1)!==0)coefficient=u32(coefficient|2**col);
    }
    return{coefficient,rhs:(output>>>bit)&1};
  });
  for(let bit=0;bit<32;bit++){
    let pivot=bit;
    while(pivot<32&&((rows[pivot].coefficient>>>bit)&1)===0)pivot++;
    if(pivot===32)throw new Error('Private transform must be invertible');
    [rows[bit],rows[pivot]]=[rows[pivot],rows[bit]];
    for(let row=0;row<32;row++){
      if(row!==bit&&((rows[row].coefficient>>>bit)&1)!==0){
        rows[row].coefficient=u32(rows[row].coefficient^rows[bit].coefficient);
        rows[row].rhs^=rows[bit].rhs;
      }
    }
  }
  let input=0;
  for(let bit=0;bit<32;bit++)if(rows[bit].rhs)input=u32(input|2**bit);
  if(applyLinear(columns,input)!==(output>>>0))throw new Error('Linear inversion parity failure');
  return input;
}

/**
 * @param {string} name
 * @param {number} index
 * @returns {{oracle:(x:number)=>number,secret:number,target:number,attackSeed:number}}
 */
function fixture(name,index){
  const salt=name.split('').reduce((hash,ch)=>
    u32(Math.imul(hash^ch.charCodeAt(0),0x01000193)),0x811c9dc5);
  const seed=u32(0x6a09e667^salt^index);
  const inner=makeLinearTransform(seed^0xbb67ae85);
  const outer=makeLinearTransform(seed^0x3c6ef372);
  /** @type {(input:number)=>number} */
  let permutation;
  let secret;
  if(name==='rivest-degree-15'){
    permutation=makeRivestPermutation(15,seed);
    secret=makeRng(seed^0xa54ff53a)();
  }else if(name==='triangular-degree-3'||name==='triangular-degree-4'){
    permutation=makeTriangularProduct(seed,name==='triangular-degree-3'?3:4);
    secret=makeRng(seed^0xa54ff53a)();
  }else if(name==='sparse-forced-top-bit'){
    const trigger=makeRng(seed^0x21a0fe54)()&0x7fffffff;
    permutation=input=>(
      (input&0x7fffffff)===trigger?input^0x80000000:input
    )>>>0;
    // Exceptional target by construction, not a random-average target.
    secret=invertPrivateLinear(inner,trigger);
  }else throw new TypeError('Unknown source family '+name);
  /** @param {number} input @returns {number} */
  const oracle=input=>applyLinear(outer,permutation(applyLinear(inner,input)));
  return {oracle,secret,target:oracle(secret),attackSeed:seed^0x510e527f};
}

/** @param {number[]} values @returns {number|null} */
function median(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

/** @returns {void} */
function main(){
  const names=[
    'rivest-degree-15','triangular-degree-3',
    'triangular-degree-4','sparse-forced-top-bit'
  ];
  const seedIndices=24;
  const rows=[];
  for(const name of names){
    /** @type {{budget:number,solved:number,queries:number[],failed:{index:number,error:string}[]}[]} */
    const experiments=[];
    for(const budget of [8,128]){
      /** @type {number[]} */
      const queries=[];
      /** @type {{index:number,error:string}[]} */
      const failed=[];
      for(let index=0;index<seedIndices;index++){
        const item=fixture(name,index);
        try{
          const result=invertLinearSandwich(item.oracle,item.target,item.attackSeed,
            {validationTrials:budget});
          if(result.value!==item.secret||item.oracle(result.value)!==item.target) {
            throw new Error('Recovered target mismatch');
          }
          queries.push(result.queryCount);
        }catch(error){
          failed.push({
            index,error:error instanceof Error?error.message:String(error)
          });
        }
      }
      experiments.push({budget,solved:queries.length,queries,failed});
    }
    rows.push({
      name,cases:seedIndices,
      low8:{
        solved:experiments[0].solved,
        medianSuccessfulQueries:median(experiments[0].queries),
        maxSuccessfulQueries:experiments[0].queries.length?
          Math.max(...experiments[0].queries):null,
        failed:experiments[0].failed
      },
      historical128:{
        solved:experiments[1].solved,
        medianSuccessfulQueries:median(experiments[1].queries),
        maxSuccessfulQueries:experiments[1].queries.length?
          Math.max(...experiments[1].queries):null,
        failed:experiments[1].failed
      }
    });
  }
  console.log(JSON.stringify({
    experiment:'Unseen high-degree and forced-exception compatible permutation stress',
    model:'Dense private 32x32 input/output maps; oracle-only target inverter',
    sourceFamilies:names,seedIndices,
    invariant:'Final oracle equality and source-secret equality checked for every success',
    scope:'This probe records misses as data; it makes no universal oracle inversion claim',
    rows
  },null,2));
}

if(require.main===module)main();
module.exports={makeTriangularProduct,invertPrivateLinear,fixture,main};
