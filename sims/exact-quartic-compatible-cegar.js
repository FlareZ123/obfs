'use strict';

const {evaluateBoundedDegreeModel,masksOfWeight}=
  require('./bounded-degree-oracle-functional-clone');

const WIDTH=32;

/** @param {number} target @returns {number} */
function checkedTarget(target){
  if(!Number.isSafeInteger(target)||target<0||target>0xffffffff)
    throw new RangeError('Expected unsigned 32-bit target');
  return target>>>0;
}

/** @param {number} value @returns {number} */
function parity32(value) {
  let x=value>>>0;
  x^=x>>>16;
  x^=x>>>8;
  x^=x>>>4;
  x&=15;
  return (0x6996>>>x)&1;
}

/**
 * Include one vector in a GF(2) span, with unique highest set bit pivots.
 * @param {Uint32Array} pivots @param {number} source
 * @returns {boolean} true when rank increases
 */
function insertPivot(pivots,source){
  let vector=source>>>0;
  for(let bit=WIDTH-1;bit>=0&&vector!==0;bit--){
    if(((vector>>>bit)&1)===0)continue;
    if(pivots[bit])vector=(vector^pivots[bit])>>>0;
    else{pivots[bit]=vector;return true;}
  }
  return false;
}

/**
 * Compute all output masks orthogonal to a span, using GF(2) RREF.
 * @param {Uint32Array} pivots
 * @returns {number[]}
 */
function orthogonalComplement(pivots){
  const matrix=Array.from(pivots).filter(Boolean);
  /** @type {number[]} */
  const pivotColumns=[];
  let rank=0;
  for(let col=0;col<WIDTH;col++){
    let chosen=-1;
    for(let row=rank;row<matrix.length;row++){
      if(((matrix[row]>>>col)&1)!==0){chosen=row;break;}
    }
    if(chosen<0)continue;
    [matrix[rank],matrix[chosen]]=[matrix[chosen],matrix[rank]];
    for(let row=0;row<matrix.length;row++){
      if(row!==rank&&((matrix[row]>>>col)&1)!==0)
        matrix[row]=(matrix[row]^matrix[rank])>>>0;
    }
    pivotColumns.push(col);
    rank++;
    if(rank===matrix.length)break;
  }
  const occupied=new Set(pivotColumns);
  /** @type {number[]} */
  const result=[];
  for(let free=0;free<WIDTH;free++){
    if(occupied.has(free))continue;
    let mask=(2**free)>>>0;
    for(let row=0;row<rank;row++){
      if(parity32(matrix[row]&mask)!==0)
        mask=(mask|((2**pivotColumns[row])>>>0))>>>0;
    }
    result.push(mask);
  }
  return result;
}

/**
 * Restrict candidate output masks to the current output image subspace,
 * keeping only linearly independent restrictions and original mask values.
 * @param {number[]} masks @param {number[]} outputBasis @returns {number[]}
 */
function independentRestrictions(masks,outputBasis){
  /** @type {Map<number,{signature:number,mask:number}>} */
  const pivots=new Map();
  /** @type {number[]} */
  const selected=[];
  for(const original of masks){
    let signature=0;
    for(let j=0;j<outputBasis.length;j++){
      if(parity32(original&outputBasis[j]))signature=(signature|((2**j)>>>0))>>>0;
    }
    let mask=original;
    for(let bit=outputBasis.length-1;bit>=0;bit--){
      if(((signature>>>bit)&1)===0)continue;
      const prior=pivots.get(bit);
      if(prior){signature=(signature^prior.signature)>>>0;mask=(mask^prior.mask)>>>0;}
      else{pivots.set(bit,{signature,mask});selected.push(mask);break;}
    }
  }
  return selected;
}

/** @param {number[]} basis @param {number[]} labels @returns {{basis:number[],toggle:number}} */
function splitKernel(basis,labels){
  const pivot=labels.indexOf(1);
  if(pivot<0)throw new Error('nonzero restriction required');
  const toggle=basis[pivot];
  /** @type {number[]} */
  const next=[];
  for(let i=0;i<basis.length;i++){
    if(i===pivot)continue;
    next.push(labels[i]===0?basis[i]:(basis[i]^toggle)>>>0);
  }
  // Independence is preserved by these elementary basis operations.
  return{basis:next,toggle};
}

/**
 * @typedef {{bits:number,degree:number,coefficients:Array<[number,number]>,queryCount:number}} PolynomialModel
 * @typedef {{xIndex:number,vMask:number,value:number}} SplitTerm
 */

/**
 * Precompile the exact nonconstant x-ANF coefficients for the defect
 * Z(x,v)=F(x+v)^F(x)^F(v)^F(0), for all v and a degree <=4 model F.
 * Every monomial M contributes value times x_S * v_(M minus S) for each
 * nonempty proper subset S of M, with no source-oracle evaluations.
 *
 * @param {PolynomialModel} model
 * @param {'scan'|'grouped'} [strategy]
 * @returns {{contract:(direction:number,consume:(vector:number,xMask:number)=>void)=>void,
 *   splitTermCount:number,coefficientSlots:number}}
 */
function makeBoundedDegreeDefectContractor(model,strategy='scan'){
  if(strategy!=='scan'&&strategy!=='grouped')
    throw new TypeError('Unknown derivative contraction strategy');
  if(model.bits!==WIDTH || ![2,3,4].includes(model.degree))
    throw new TypeError('expected 32-bit Boolean model with degree 2..4');
  if(!Array.isArray(model.coefficients))
    throw new TypeError('expected Boolean ANF coefficient pairs');
  // A declared invalid coefficient can be rejected, unlike an omitted
  // high-degree source term that is indistinguishable at fitting inputs.
  for(const [monomial,value] of model.coefficients){
    if(!Number.isSafeInteger(monomial)||monomial<0||monomial>0xffffffff||
       !Number.isSafeInteger(value)||value<0||value>0xffffffff)
      throw new TypeError('ANF coefficients require unsigned 32-bit words');
    let remaining=monomial>>>0,weight=0;
    while(remaining){remaining=(remaining&(remaining-1))>>>0;weight++;}
    if(weight>model.degree)
      throw new TypeError('ANF coefficient outside promised degree');
  }
  /** @type {Map<number,number>} */
  const index=new Map();
  /** @type {number[]} */
  const xMasks=[];
  // A sparse coefficient table can omit zero-coefficient monomials, but
  // their x slots can still receive derivatives of higher-degree terms.
  // Build every possible low-weight x slot independently of model entries.
  for(let bits=1;bits<model.degree;bits++){
    for(const mask of masksOfWeight(WIDTH,bits)){
      index.set(mask,index.size);
      xMasks.push(mask);
    }
  }
  /** @type {SplitTerm[]} */
  const terms=[];
  /** @type {Map<number,Array<[number,number]>>} */
  const grouped=new Map();
  let splitTermCount=0;
  for(const [maskRaw,valueRaw] of model.coefficients){
    const mask=maskRaw>>>0,value=valueRaw>>>0;
    if(!value)continue;
    for(let subset=(mask-1)&mask;subset;subset=(subset-1)&mask){
      const xIndex=index.get(subset>>>0);
      if(xIndex===undefined)continue;
      const vMask=(mask^subset)>>>0;
      if(strategy==='grouped'){
        let bucket=grouped.get(vMask);
        if(!bucket){bucket=[];grouped.set(vMask,bucket);}
        bucket.push([xIndex,value]);
      }else terms.push({xIndex,vMask,value});
      splitTermCount++;
    }
  }
  /** @param {number} direction
   *  @param {(vector:number,xMask:number)=>void} consume @returns {void} */
  function contract(direction,consume){
    const v=direction>>>0;
    const coefficients=new Uint32Array(index.size);
    if(strategy==='grouped'){
      /** @type {number[]} */
      const setBits=[];
      for(let bit=0;bit<WIDTH;bit++){
        if(((v>>>bit)&1)!==0)setBits.push((2**bit)>>>0);
      }
      /** @param {number} mask @returns {void} */
      function accumulate(mask){
        const bucket=grouped.get(mask);
        if(!bucket)return;
        for(const [xIndex,value] of bucket)coefficients[xIndex]^=value;
      }
      // Every nonempty v monomial in a degree <=4 defect has weight
      // at most three. Enumerating only active bit subsets avoids scanning
      // every source term for every direction, especially sparse directions.
      for(let i=0;i<setBits.length;i++){
        const one=setBits[i];
        accumulate(one);
        if(model.degree<3)continue;
        for(let j=i+1;j<setBits.length;j++){
          const two=(one|setBits[j])>>>0;
          accumulate(two);
          if(model.degree<4)continue;
          for(let k=j+1;k<setBits.length;k++)
            accumulate((two|setBits[k])>>>0);
        }
      }
    }else{
      for(const term of terms){
        // Bitwise AND yields signed int32. Normalize before comparing vMasks
        // whose highest bit is set; otherwise the derivative certificate fails.
        if(((v&term.vMask)>>>0)===term.vMask)coefficients[term.xIndex]^=term.value;
      }
    }
    for(let slot=0;slot<coefficients.length;slot++){
      const coefficient=coefficients[slot];
      if(coefficient!==0)consume(coefficient>>>0,xMasks[slot]);
    }
  }
  return{contract,splitTermCount,coefficientSlots:index.size};
}

/**
 * A degree <=2,3,4 Boolean ANF clone with promised compatible-triangular
 * invertible structure can be inverted exactly offline after interpolation.
 * This CEGAR uses a complete global derivative-mask certificate from only
 * a basis of each current input subspace.
 *
 * @param {PolynomialModel} model
 * @param {{strategy?:'scan'|'grouped'}} [options]
 * @returns {{invert:(target:number)=>number,invertFast:(target:number)=>number,
 *   clone:(input:number)=>number,contractions:number,
 *   derivativeContractions:number,coefficientSlots:number,splitTermCount:number}}
 */
function prepareExactBoundedDegreeInverter(model,options={}){
  const prepared=makeBoundedDegreeDefectContractor(model,options.strategy??'scan');
  /** @param {number} x @returns {number} */
  const clone=x=>evaluateBoundedDegreeModel(model,x>>>0)>>>0;
  const base=clone(0);
  let inputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  let outputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  /** @type {number[]} */
  const outputMasks=[];
  /** @type {number[]} */
  const inputToggles=[];
  let contractions=0;
  for(let level=0;level<WIDTH;level++){
    const pivots=new Uint32Array(WIDTH);
    for(const u of inputBasis){
      prepared.contract(u,value=>{insertPivot(pivots,value);});
      contractions++;
    }
    const candidates=independentRestrictions(orthogonalComplement(pivots),outputBasis);
    /** @type {{mask:number,inLabels:number[],outLabels:number[]}|null} */
    let accepted=null;
    for(const mask of candidates){
      const inLabels=inputBasis.map(v=>parity32(mask&(clone(v)^base)));
      if(!inLabels.includes(1))continue;
      const outLabels=outputBasis.map(v=>parity32(mask&v));
      if(!outLabels.includes(1))continue;
      accepted={mask,inLabels,outLabels};break;
    }
    if(!accepted)throw new Error('exact derivative flag unavailable at level '+level);
    const inputSplit=splitKernel(inputBasis,accepted.inLabels);
    const outputSplit=splitKernel(outputBasis,accepted.outLabels);
    inputBasis=inputSplit.basis;
    outputBasis=outputSplit.basis;
    outputMasks.push(accepted.mask);
    inputToggles.push(inputSplit.toggle);
  }
  /** @param {number} target @returns {number} */
  function invert(target){
    const desired=checkedTarget(target);
    let candidate=0;
    for(let level=0;level<WIDTH;level++){
      if(parity32(outputMasks[level]&((desired^clone(candidate))>>>0)))
        candidate=(candidate^inputToggles[level])>>>0;
    }
    if(clone(candidate)!==desired)throw new Error('exact bounded-degree inverse equality failed');
    return candidate>>>0;
  }
  // Compile a target-independent exact local forward difference for
  // every selected toggle. It allows incremental inversion in place of
  // recomputing the full degree-four ANF model at every stage.
  /** @type {Array<{toggle:number,zeroDelta:number,terms:Array<[number,number]>}>} */
  const derivativeUpdates=[];
  for(const toggle of inputToggles){
    /** @type {Array<[number,number]>} */
    const terms=[];
    prepared.contract(toggle,(value,xMask)=>terms.push([xMask,value]));
    derivativeUpdates.push({toggle,zeroDelta:(clone(toggle)^base)>>>0,terms});
  }
  /**
   * Maintain the *actual model output* F(candidate). For an input toggle u,
   * F(x xor u) = F(x) xor Z(x,u) xor F(u) xor F(0).
   * All Z coefficient terms are precomputed at setup, so only monomial
   * membership tests and XORs are needed after the output decision.
   * @param {number} target
   * @returns {number}
   */
  function invertFast(target){
    const desired=checkedTarget(target);
    let candidate=0;
    let currentOutput=base;
    for(let level=0;level<WIDTH;level++){
      if(!parity32(outputMasks[level]&((desired^currentOutput)>>>0)))continue;
      const update=derivativeUpdates[level];
      let delta=update.zeroDelta;
      for(const [mask,value] of update.terms){
        if(((candidate&mask)>>>0)===mask)delta=(delta^value)>>>0;
      }
      candidate=(candidate^update.toggle)>>>0;
      currentOutput=(currentOutput^delta)>>>0;
    }
    // Check both the maintained invariant and an independent local model
    // evaluation. Neither check makes a false source-degree promise true.
    if(currentOutput!==desired||clone(candidate)!==desired)
      throw new Error('exact incremental inverse equality failed');
    return candidate>>>0;
  }
  return {invert,invertFast,clone,contractions,
    derivativeContractions:derivativeUpdates.length,
    coefficientSlots:prepared.coefficientSlots,splitTermCount:prepared.splitTermCount};
}

module.exports={makeBoundedDegreeDefectContractor,prepareExactBoundedDegreeInverter};
