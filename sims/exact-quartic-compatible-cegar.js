'use strict';

const {evaluateBoundedDegreeModel,masksOfWeight}=
  require('./bounded-degree-oracle-functional-clone');

const WIDTH=32;

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
 * @returns {{contract:(direction:number,consume:(vector:number)=>void)=>void,
 *   splitTermCount:number,coefficientSlots:number}}
 */
function makeBoundedDegreeDefectContractor(model){
  if(model.bits!==WIDTH || ![2,3,4].includes(model.degree))
    throw new TypeError('expected 32-bit Boolean model with degree 2..4');
  /** @type {Map<number,number>} */
  const index=new Map();
  // A sparse coefficient table can omit zero-coefficient monomials, but
  // their x slots can still receive derivatives of higher-degree terms.
  // Build every possible low-weight x slot independently of model entries.
  for(let bits=1;bits<model.degree;bits++){
    for(const mask of masksOfWeight(WIDTH,bits))index.set(mask,index.size);
  }
  /** @type {SplitTerm[]} */
  const terms=[];
  for(const [maskRaw,valueRaw] of model.coefficients){
    const mask=maskRaw>>>0,value=valueRaw>>>0;
    if(!value)continue;
    for(let subset=(mask-1)&mask;subset;subset=(subset-1)&mask){
      const xIndex=index.get(subset>>>0);
      if(xIndex===undefined)continue;
      terms.push({xIndex,vMask:(mask^subset)>>>0,value});
    }
  }
  /** @param {number} direction @param {(vector:number)=>void} consume @returns {void} */
  function contract(direction,consume){
    const v=direction>>>0;
    const coefficients=new Uint32Array(index.size);
    for(const term of terms){
      // Bitwise AND yields signed int32. Normalize before comparing vMasks
      // whose highest bit is set; otherwise the derivative certificate fails.
      if(((v&term.vMask)>>>0)===term.vMask)coefficients[term.xIndex]^=term.value;
    }
    for(const coefficient of coefficients)if(coefficient!==0)consume(coefficient>>>0);
  }
  return{contract,splitTermCount:terms.length,coefficientSlots:index.size};
}

/**
 * A degree <=2,3,4 Boolean ANF clone with promised compatible-triangular
 * invertible structure can be inverted exactly offline after interpolation.
 * This CEGAR uses a complete global derivative-mask certificate from only
 * a basis of each current input subspace.
 *
 * @param {PolynomialModel} model
 * @returns {{invert:(target:number)=>number,clone:(input:number)=>number,
 *  contractions:number,coefficientSlots:number,splitTermCount:number}}
 */
function prepareExactBoundedDegreeInverter(model){
  const prepared=makeBoundedDegreeDefectContractor(model);
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
    let candidate=0;
    for(let level=0;level<WIDTH;level++){
      if(parity32(outputMasks[level]&((target^clone(candidate))>>>0)))
        candidate=(candidate^inputToggles[level])>>>0;
    }
    if(clone(candidate)!==(target>>>0))throw new Error('exact bounded-degree inverse equality failed');
    return candidate>>>0;
  }
  return {invert,clone,contractions,
    coefficientSlots:prepared.coefficientSlots,splitTermCount:prepared.splitTermCount};
}

module.exports={makeBoundedDegreeDefectContractor,prepareExactBoundedDegreeInverter};
