'use strict';

const {
  makeRng,
  makeLinearTransform,
  applyLinear,
  makeTriangularCompatiblePermutation,
  u32,
}=require('./compatible-permutation-linear-sandwich-blackbox');
const {learnBoundedDegreeOracle}=
  require('./bounded-degree-oracle-functional-clone');

const WIDTH=32;

/**
 * @typedef {{seed:number,oracleQueries:number,holdouts:number,cloneMismatches:number,
 *   targets:number,inversions:number,offlineDefectEvaluations:number,
 *   radicalDimension:number,radicalCodimension:number}} ExactQuadraticTrialResult
 */

/**
 * @typedef {{model:string,oracleQueriesPerInstance:number[],instances:number,
 *   totalHoldouts:number,cloneMismatches:number,totalTargets:number,
 *   exactInversions:number,offlineDefectEvaluationsPerInstance:number[],
 *   radicalCodimensions:number[],rows:ExactQuadraticTrialResult[]}} ExactQuadraticSuiteResult
 */

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;
  x^=x>>>8;
  x^=x>>>4;
  x&=15;
  return(0x6996>>>x)&1;
}

/** @param {number[]} vectors @returns {number[]} */
function makeSpanBasis(vectors){
  /** @type {number[]} */
  const pivots=Array(WIDTH).fill(0);
  for(const raw of vectors){
    let value=raw>>>0;
    for(let bit=31;bit>=0&&value!==0;bit-=1){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value=u32(value^pivots[bit]);
      else{
        pivots[bit]=value;
        break;
      }
    }
  }
  return pivots.filter(Boolean);
}

/** @param {number[]} rows @returns {number[]} */
function orthogonalComplement(rows){
  const matrix=rows.filter(Boolean).map(u32);
  /** @type {number[]} */
  const pivots=[];
  let rank=0;
  for(let col=0;col<WIDTH;col+=1){
    let selected=-1;
    for(let row=rank;row<matrix.length;row+=1){
      if(((matrix[row]>>>col)&1)!==0){
        selected=row;
        break;
      }
    }
    if(selected<0)continue;
    [matrix[rank],matrix[selected]]=[matrix[selected],matrix[rank]];
    const pivot=matrix[rank];
    for(let row=0;row<matrix.length;row+=1){
      if(row!==rank&&((matrix[row]>>>col)&1)!==0){
        matrix[row]=u32(matrix[row]^pivot);
      }
    }
    pivots.push(col);
    rank+=1;
    if(rank===matrix.length)break;
  }
  matrix.length=rank;
  const pivotSet=new Set(pivots);
  const result=[];
  for(let free=0;free<WIDTH;free+=1){
    if(pivotSet.has(free))continue;
    let mask=(2**free)>>>0;
    for(let row=0;row<rank;row+=1){
      if(parity32(matrix[row]&mask)!==0){
        mask=u32(mask|((2**pivots[row])>>>0));
      }
    }
    result.push(mask);
  }
  return result;
}

/**
 * Keep masks whose restrictions to the current output subspace are independent.
 * @param {number[]} masks
 * @param {number[]} outputBasis
 * @returns {number[]}
 */
function independentRestrictions(masks,outputBasis){
  /** @type {Map<number,{signature:number,mask:number}>} */
  const pivots=new Map();
  const result=[];
  for(const candidate of masks){
    let signature=0;
    for(let index=0;index<outputBasis.length;index+=1){
      if(parity32(candidate&outputBasis[index])!==0){
        signature=u32(signature|((2**index)>>>0));
      }
    }
    let mask=candidate;
    for(let bit=outputBasis.length-1;bit>=0;bit-=1){
      if(((signature>>>bit)&1)===0)continue;
      const prior=pivots.get(bit);
      if(prior){
        signature=u32(signature^prior.signature);
        mask=u32(mask^prior.mask);
      }else{
        pivots.set(bit,{signature,mask});
        result.push(mask);
        break;
      }
    }
  }
  return result;
}

/**
 * Split a basis into the kernel of a nonzero GF(2) linear label and one complement toggle.
 * @param {number[]} basis
 * @param {number[]} labels
 * @returns {{basis:number[],toggle:number}}
 */
function splitKernel(basis,labels){
  const pivotIndex=labels.indexOf(1);
  if(pivotIndex<0)throw new Error('linear label unexpectedly zero');
  const toggle=basis[pivotIndex];
  const next=[];
  for(let index=0;index<basis.length;index+=1){
    if(index===pivotIndex)continue;
    next.push(labels[index]===0?basis[index]:u32(basis[index]^toggle));
  }
  return{basis:makeSpanBasis(next),toggle};
}

/**
 * Build a fast evaluator and exact polar contraction from a degree-two ANF model.
 * @param {{bits:number,degree:number,coefficients:Array<[number,number]>}} model
 * @returns {{clone:(input:number)=>number,polar:(basisIndex:number,direction:number)=>number,
 *   constant:number,linear:number[],quadratic:number[][]}}
 */
function makeQuadraticModelEvaluator(model){
  if(model.bits!==WIDTH||model.degree!==2){
    throw new TypeError('expected a 32-bit degree-two model');
  }
  let constant=0;
  const linear=Array(WIDTH).fill(0);
  const quadratic=Array.from({length:WIDTH},()=>Array(WIDTH).fill(0));
  for(const [rawMask,rawCoefficient] of model.coefficients){
    const mask=rawMask>>>0;
    const coefficient=rawCoefficient>>>0;
    let first=-1;
    let second=-1;
    for(let bit=0;bit<WIDTH;bit+=1){
      if(((mask>>>bit)&1)===0)continue;
      if(first<0)first=bit;
      else if(second<0)second=bit;
      else throw new Error('model contains a monomial above degree two');
    }
    if(first<0)constant=coefficient;
    else if(second<0)linear[first]=coefficient;
    else quadratic[first][second]=coefficient;
  }
  /** @param {number} input @returns {number} */
  const clone=input=>{
    const x=input>>>0;
    let output=constant;
    for(let i=0;i<WIDTH;i+=1){
      if(((x>>>i)&1)!==0)output=u32(output^linear[i]);
    }
    for(let i=0;i<WIDTH;i+=1){
      if(((x>>>i)&1)===0)continue;
      for(let j=i+1;j<WIDTH;j+=1){
        if(((x>>>j)&1)!==0)output=u32(output^quadratic[i][j]);
      }
    }
    return output>>>0;
  };
  /** @param {number} basisIndex @param {number} direction @returns {number} */
  const polar=(basisIndex,direction)=>{
    let output=0;
    for(let bit=0;bit<WIDTH;bit+=1){
      if(bit===basisIndex||((direction>>>bit)&1)===0)continue;
      const low=Math.min(bit,basisIndex);
      const high=Math.max(bit,basisIndex);
      output=u32(output^quadratic[low][high]);
    }
    return output>>>0;
  };
  return{clone,polar,constant,linear,quadratic};
}

/**
 * Exact CEGAR peel for a vector-valued quadratic Boolean permutation.
 * The second-difference defect is bilinear, so standard input basis vectors
 * and a basis of the current input subspace span every required defect.
 *
 * @param {(input:number)=>number} clone
 * @param {(basisIndex:number,direction:number)=>number} [polar]
 *   Exact contraction Z(e_basisIndex,direction), when available from ANF coefficients.
 * @returns {{invert:(target:number)=>number,outputMasks:number[],inputToggles:number[],offlineDefectEvaluations:number}}
 */
function prepareExactQuadraticInverter(clone,polar){
  const base=clone(0)>>>0;
  let inputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  let outputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  const standard=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  const outputMasks=[];
  const inputToggles=[];
  let offlineDefectEvaluations=0;

  for(let level=0;level<WIDTH;level+=1){
    const defects=[];
    for(const direction of inputBasis){
      for(let pointIndex=0;pointIndex<standard.length;pointIndex+=1){
        const pointBasis=standard[pointIndex];
        const defect=polar
          ?polar(pointIndex,direction)
          :u32(clone(pointBasis)^clone(pointBasis^direction)^base^clone(direction));
        defects.push(defect>>>0);
        offlineDefectEvaluations+=1;
      }
    }
    const defectBasis=makeSpanBasis(defects);
    const candidates=independentRestrictions(orthogonalComplement(defectBasis),outputBasis);
    /** @type {{mask:number,inputLabels:number[],outputLabels:number[]}|null} */
    let accepted=null;
    for(const mask of candidates){
      const inputLabels=inputBasis.map(vector=>parity32(mask&u32(clone(vector)^base)));
      if(!inputLabels.includes(1))continue;
      const outputLabels=outputBasis.map(vector=>parity32(mask&vector));
      if(!outputLabels.includes(1))continue;
      accepted={mask,inputLabels,outputLabels};
      break;
    }
    if(accepted===null){
      throw new Error(`exact quadratic CEGAR found no output functional at level ${level}`);
    }
    const outputSplit=splitKernel(outputBasis,accepted.outputLabels);
    const inputSplit=splitKernel(inputBasis,accepted.inputLabels);
    outputBasis=outputSplit.basis;
    inputBasis=inputSplit.basis;
    outputMasks.push(accepted.mask);
    inputToggles.push(inputSplit.toggle);
  }

  /** @param {number} target @returns {number} */
  function invert(target){
    let candidate=0;
    for(let level=0;level<WIDTH;level+=1){
      const residual=u32((target>>>0)^clone(candidate));
      if(parity32(outputMasks[level]&residual)!==0){
        candidate=u32(candidate^inputToggles[level]);
      }
    }
    if(clone(candidate)!==(target>>>0)){
      throw new Error('exact quadratic CEGAR final equality failed');
    }
    return candidate>>>0;
  }

  return{invert,outputMasks,inputToggles,offlineDefectEvaluations};
}

/**
 * Construct the repository's nonlinear triangular compatible permutation
 * behind dense invertible affine maps and independent translations.
 * The serialized private module source is used by the live SCO harness.
 * @param {number} seed
 * @returns {{oracle:(input:number)=>number,secret:()=>number,privateSource:string}}
 */
function makeFixture(seed){
  const permutationSeed=seed^0x12345678;
  const permutation=makeTriangularCompatiblePermutation(permutationSeed);
  const specNext=makeRng(permutationSeed);
  const specs=Array.from({length:WIDTH},(_,bit)=>{
    const lowerMask=bit===0?0:u32((2**bit)-1);
    return{
      a:specNext()&lowerMask,
      b:specNext()&lowerMask,
      c:specNext()&lowerMask,
      constant:specNext()&1
    };
  });
  const inner=makeLinearTransform(seed^0xbb67ae85);
  const outer=makeLinearTransform(seed^0x3c6ef372);
  const next=makeRng(seed^0xa54ff53a);
  const innerOffset=next();
  const outputOffset=next();
  const secretNext=makeRng(seed^0x510e527f);
  /** @param {number} input @returns {number} */
  const oracle=input=>u32(applyLinear(outer,permutation(u32(applyLinear(inner,input)^innerOffset)))^outputOffset);
  const privateSource=[
    `const TRIANGULAR_SPECS=${JSON.stringify(specs)};`,
    `const INNER_COLUMNS=${JSON.stringify(inner)};`,
    `const OUTER_COLUMNS=${JSON.stringify(outer)};`,
    `const INNER_OFFSET=${innerOffset>>>0};`,
    `const OUTPUT_OFFSET=${outputOffset>>>0};`,
    `function parity32(value){let x=value>>>0;x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;return(0x6996>>>x)&1;}`,
    `function applyLinear(columns,input){let x=input>>>0;let output=0;for(let bit=0;bit<32;bit++){if(((x>>>bit)&1)!==0)output=(output^columns[bit])>>>0;}return output>>>0;}`,
    `function triangular(input){const x=input>>>0;let output=0;for(let bit=0;bit<32;bit++){const lowerMask=bit===0?0:((2**bit)-1)>>>0;const lower=x&lowerMask;const spec=TRIANGULAR_SPECS[bit];const nonlinear=parity32(lower&spec.a)^(parity32(lower&spec.b)&parity32(lower&spec.c))^spec.constant;if((((x>>>bit)&1)^nonlinear)!==0)output=(output+((2**bit)>>>0))>>>0;}return output>>>0;}`,
    `export async function protectedTriangular(value){const x=value>>>0;const z=(applyLinear(INNER_COLUMNS,x)^INNER_OFFSET)>>>0;return(applyLinear(OUTER_COLUMNS,triangular(z))^OUTPUT_OFFSET)>>>0;}`
  ].join('\n');
  return{oracle,secret:()=>secretNext(),privateSource};
}

/**
 * Compute the dimension of the common radical of the vector-valued polar form.
 * The 32 packed columns live in GF(2)^(32*32).
 * @param {(input:number)=>number} clone
 * @param {(basisIndex:number,direction:number)=>number} [polar]
 * @returns {{dimension:number,codimension:number}}
 */
function polarRadicalDimensions(clone,polar){
  const base=clone(0)>>>0;
  const standard=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  const columns=[];
  for(let leftIndex=0;leftIndex<WIDTH;leftIndex+=1){
    const left=standard[leftIndex];
    let packed=0n;
    for(let rightIndex=0;rightIndex<WIDTH;rightIndex+=1){
      const right=standard[rightIndex];
      const value=polar
        ?polar(leftIndex,right)
        :u32(clone(left)^clone(right)^clone(left^right)^base);
      packed|=BigInt(value)<<(32n*BigInt(rightIndex));
    }
    columns.push(packed);
  }
  /** @type {Map<number,bigint>} */
  const pivots=new Map();
  for(let value of columns){
    while(value!==0n){
      const position=value.toString(2).length-1;
      const old=pivots.get(position);
      if(old!==undefined)value^=old;
      else{
        pivots.set(position,value);
        break;
      }
    }
  }
  const codimension=pivots.size;
  return{dimension:WIDTH-codimension,codimension};
}

/**
 * Clone one compatible quadratic oracle with the generic 529-query learner,
 * then invert targets locally with exact bilinear-defect CEGAR.
 * @param {number} seed
 * @param {{holdouts?:number,targets?:number}} [options]
 * @returns {ExactQuadraticTrialResult}
 */
function runTrial(seed,options={}){
  const holdouts=options.holdouts??1028;
  const targets=options.targets??20;
  const fixture=makeFixture(seed);
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    const key=input>>>0;
    if(!cache.has(key))cache.set(key,fixture.oracle(key)>>>0);
    return cache.get(key);
  };
  const model=learnBoundedDegreeOracle(query,WIDTH,2);
  const evaluator=makeQuadraticModelEvaluator(model);
  const clone=evaluator.clone;
  const inverter=prepareExactQuadraticInverter(clone,evaluator.polar);
  const radical=polarRadicalDimensions(clone,evaluator.polar);
  const verify=makeRng(seed^0xbad5eed);
  let mismatches=0;
  for(let i=0;i<holdouts;i+=1){
    const point=verify();
    if(clone(point)!==(fixture.oracle(point)>>>0))mismatches+=1;
  }
  const targetNext=makeRng(seed^0x12345678);
  let inversions=0;
  for(let i=0;i<targets;i+=1){
    const secret=targetNext();
    const target=fixture.oracle(secret)>>>0;
    if(inverter.invert(target)===secret)inversions+=1;
  }
  return{
    seed:u32(seed),
    oracleQueries:cache.size,
    holdouts,
    cloneMismatches:mismatches,
    targets,
    inversions,
    offlineDefectEvaluations:inverter.offlineDefectEvaluations,
    radicalDimension:radical.dimension,
    radicalCodimension:radical.codimension
  };
}

/**
 * Reproduce the 64-instance, 32-bit quadratic-clone and exact-inversion suite.
 * @param {{trials?:number,holdouts?:number,targets?:number,seed?:number}} [options]
 * @returns {ExactQuadraticSuiteResult}
 */
function runSuite(options={}){
  const trials=options.trials??64;
  const holdouts=options.holdouts??1028;
  const targets=options.targets??20;
  const seed=options.seed??0x71000000;
  /** @type {ExactQuadraticTrialResult[]} */
  const rows=[];
  for(let i=0;i<trials;i+=1){
    rows.push(runTrial(u32(seed+Math.imul(i,0x10203)),{holdouts,targets}));
  }
  return{
    model:'32-bit nonlinear triangular compatible Boolean permutation (algebraic degree <=2), two dense invertible affine wrappers, independent input/output offsets',
    oracleQueriesPerInstance:[...new Set(rows.map(row=>row.oracleQueries))],
    instances:trials,
    totalHoldouts:rows.reduce((sum,row)=>sum+row.holdouts,0),
    cloneMismatches:rows.reduce((sum,row)=>sum+row.cloneMismatches,0),
    totalTargets:rows.reduce((sum,row)=>sum+row.targets,0),
    exactInversions:rows.reduce((sum,row)=>sum+row.inversions,0),
    offlineDefectEvaluationsPerInstance:[...new Set(rows.map(row=>row.offlineDefectEvaluations))],
    radicalCodimensions:[...new Set(rows.map(row=>row.radicalCodimension))],
    rows
  };
}

if(require.main===module){
  process.stdout.write(`${JSON.stringify(runSuite(),null,2)}\n`);
}

module.exports={
  makeQuadraticModelEvaluator,
  prepareExactQuadraticInverter,
  makeFixture,
  polarRadicalDimensions,
  runTrial,
  runSuite
};
