'use strict';

const {evaluateBoundedDegreeModel}=require('./bounded-degree-oracle-functional-clone');

const WIDTH=32;

/**
 * @typedef {{bits:number,degree:number,coefficients:Array<[number,number]>,
 *   queryCount:number}} CubicModel
 */

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}

/** @param {number[]} vectors @returns {number[]} */
function spanBasis(vectors){
  /** @type {number[]} */
  const pivots=Array(WIDTH).fill(0);
  for(const raw of vectors){
    let value=raw>>>0;
    for(let bit=WIDTH-1;bit>=0&&value!==0;bit--){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value=(value^pivots[bit])>>>0;
      else{pivots[bit]=value;break;}
    }
  }
  return pivots.filter(Boolean);
}

/** @param {number[]} rows @returns {number[]} */
function orthogonalComplement(rows){
  const matrix=rows.filter(Boolean).map(x=>x>>>0);
  /** @type {number[]} */
  const pivotColumns=[];
  let rank=0;
  for(let col=0;col<WIDTH;col++){
    let selected=-1;
    for(let row=rank;row<matrix.length;row++){
      if(((matrix[row]>>>col)&1)!==0){selected=row;break;}
    }
    if(selected<0)continue;
    [matrix[rank],matrix[selected]]=[matrix[selected],matrix[rank]];
    const pivot=matrix[rank];
    for(let row=0;row<matrix.length;row++){
      if(row!==rank&&((matrix[row]>>>col)&1)!==0){
        matrix[row]=(matrix[row]^pivot)>>>0;
      }
    }
    pivotColumns.push(col);
    rank++;
    if(rank===matrix.length)break;
  }
  const occupied=new Set(pivotColumns);
  const result=[];
  for(let free=0;free<WIDTH;free++){
    if(occupied.has(free))continue;
    let mask=(2**free)>>>0;
    for(let row=0;row<rank;row++){
      if(parity32(matrix[row]&mask)!==0)mask=(mask|((2**pivotColumns[row])>>>0))>>>0;
    }
    result.push(mask);
  }
  return result;
}

/**
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
    for(let index=0;index<outputBasis.length;index++){
      if(parity32(candidate&outputBasis[index])!==0){
        signature=(signature|((2**index)>>>0))>>>0;
      }
    }
    let mask=candidate;
    for(let bit=outputBasis.length-1;bit>=0;bit--){
      if(((signature>>>bit)&1)===0)continue;
      const prior=pivots.get(bit);
      if(prior){
        signature=(signature^prior.signature)>>>0;
        mask=(mask^prior.mask)>>>0;
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
 * @param {number[]} basis
 * @param {number[]} labels
 * @returns {{basis:number[],toggle:number}}
 */
function splitKernel(basis,labels){
  const pivot=labels.indexOf(1);
  if(pivot<0)throw new Error('nonzero linear label required');
  const toggle=basis[pivot];
  const result=[];
  for(let i=0;i<basis.length;i++){
    if(i===pivot)continue;
    result.push(labels[i]===0?basis[i]:(basis[i]^toggle)>>>0);
  }
  return{basis:spanBasis(result),toggle};
}

/**
 * Contract the polar defect of a vector-valued Boolean cubic map.
 * For fixed direction v, Z(x,v) is quadratic in x:
 *   Z(x,v) = XOR_i L_i(v) x_i XOR XOR_(i<j) Q_ij(v) x_i x_j.
 * Each L_i is degree <=2 in v; each Q_ij is degree <=1 in v.
 *
 * @param {CubicModel} model
 * @returns {(direction:number,includePairs?:boolean)=>{first:Uint32Array,second:Uint32Array}}
 */
function makeCubicDefectContractor(model){
  if(model.bits!==WIDTH||model.degree!==3)throw new TypeError('expected a 32-bit cubic ANF model');

  // A complete width-32, degree-three ANF has 1+32+496+4960
  // distinct coefficients. Refuse incomplete or ill-typed attacker models
  // instead of silently certifying an invalid polynomial as exact.
  if(!Array.isArray(model.coefficients)||model.coefficients.length!==5489){
    throw new TypeError('incomplete 32-bit cubic ANF coefficient table');
  }
  const seen=new Set();
  for(const pair of model.coefficients){
    if(!Array.isArray(pair)||pair.length!==2){
      throw new TypeError('invalid cubic ANF coefficient pair');
    }
    const [mask,value]=pair;
    if(!Number.isSafeInteger(mask)||mask<0||mask>=2**32||
       !Number.isSafeInteger(value)||value<0||value>=2**32){
      throw new TypeError('invalid cubic ANF unsigned coefficients');
    }
    let monomial=mask>>>0;
    let weight=0;
    while(monomial!==0){monomial&=monomial-1;weight++;}
    if(weight>3)throw new TypeError('cubic ANF coefficient above promised degree');
    if(seen.has(mask))throw new TypeError('duplicate cubic ANF monomial');
    seen.add(mask);
  }

  /** @type {Array<{i:number,j:number,value:number}>} */
  const quadratic=[];
  /** @type {Array<{i:number,j:number,k:number,value:number}>} */
  const cubic=[];
  for(const [maskRaw,valueRaw] of model.coefficients){
    const mask=maskRaw>>>0;
    const value=valueRaw>>>0;
    if(value===0)continue;
    /** @type {number[]} */
    const bits=[];
    for(let i=0;i<WIDTH;i++)if(((mask>>>i)&1)!==0)bits.push(i);
    if(bits.length===2)quadratic.push({i:bits[0],j:bits[1],value});
    else if(bits.length===3)cubic.push({i:bits[0],j:bits[1],k:bits[2],value});
    else if(bits.length>3)throw new TypeError('ANF coefficient exceeds degree three');
  }
  return(direction,includePairs=true)=>{
    const v=direction>>>0;
    const first=new Uint32Array(WIDTH);
    const second=new Uint32Array(WIDTH*WIDTH);
    for(const term of quadratic){
      if(((v>>>term.i)&1)!==0)first[term.j]^=term.value;
      if(((v>>>term.j)&1)!==0)first[term.i]^=term.value;
    }
    for(const term of cubic){
      const bi=(v>>>term.i)&1,bj=(v>>>term.j)&1,bk=(v>>>term.k)&1;
      if(bj&&bk)first[term.i]^=term.value;
      if(bi&&bk)first[term.j]^=term.value;
      if(bi&&bj)first[term.k]^=term.value;
      if(includePairs){
        if(bi)second[term.j*WIDTH+term.k]^=term.value;
        if(bj)second[term.i*WIDTH+term.k]^=term.value;
        if(bk)second[term.i*WIDTH+term.j]^=term.value;
      }
    }
    return{first,second};
  };
}

/**
 * Exactly certify every global derivative-mask choice for a 32-bit
 * Boolean map promised to have degree <=3. Under the additional
 * two-sided-affine compatible-triangular permutation promise, the
 * globally constant derivative flag is guaranteed to complete.
 *
 * The 5489 chosen forward queries belong to the caller's ANF learner.
 * This function uses no source oracle and only local model coefficients.
 *
 * @param {CubicModel} model
 * @returns {{invert:(target:number)=>number,outputMasks:number[],
 *   inputToggles:number[],offlineContractions:number,offlineCoefficientVectors:number}}
 */
function prepareExactCubicInverter(model){
  const contract=makeCubicDefectContractor(model);
  /** @param {number} x @returns {number} */
  const clone=x=>evaluateBoundedDegreeModel(model,x>>>0)>>>0;
  const base=clone(0);
  let inputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  let outputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  /** @type {number[]} */
  const outputMasks=[];
  /** @type {number[]} */
  const inputToggles=[];
  let offlineContractions=0,offlineCoefficientVectors=0;

  for(let level=0;level<WIDTH;level++){
    const defects=[];
    const rows=inputBasis.map(v=>{offlineContractions++;return contract(v);});
    for(const row of rows){
      for(let i=0;i<WIDTH;i++){defects.push(row.first[i]);offlineCoefficientVectors++;}
      for(let i=0;i<WIDTH;i++){
        for(let j=i+1;j<WIDTH;j++){
          defects.push(row.second[i*WIDTH+j]);offlineCoefficientVectors++;
        }
      }
    }
    for(let p=0;p<inputBasis.length;p++){
      for(let q=p+1;q<inputBasis.length;q++){
        const cross=contract((inputBasis[p]^inputBasis[q])>>>0,false);
        offlineContractions++;
        for(let i=0;i<WIDTH;i++){
          defects.push((cross.first[i]^rows[p].first[i]^rows[q].first[i])>>>0);
          offlineCoefficientVectors++;
        }
      }
    }
    const candidates=independentRestrictions(orthogonalComplement(spanBasis(defects)),outputBasis);
    /** @type {{mask:number,inputLabels:number[],outputLabels:number[]}|null} */
    let accepted=null;
    for(const mask of candidates){
      const inputLabels=inputBasis.map(v=>parity32(mask&(clone(v)^base)));
      if(!inputLabels.includes(1))continue;
      const outputLabels=outputBasis.map(v=>parity32(mask&v));
      if(!outputLabels.includes(1))continue;
      accepted={mask,inputLabels,outputLabels};
      break;
    }
    if(accepted===null)throw new Error('exact cubic flag has no nonzero mask at level '+level);
    const inputSplit=splitKernel(inputBasis,accepted.inputLabels);
    const outputSplit=splitKernel(outputBasis,accepted.outputLabels);
    inputBasis=inputSplit.basis;
    outputBasis=outputSplit.basis;
    outputMasks.push(accepted.mask);
    inputToggles.push(inputSplit.toggle);
  }
  /** @param {number} target @returns {number} */
  function invert(target){
    let candidate=0;
    for(let level=0;level<WIDTH;level++){
      if(parity32(outputMasks[level]&((target^clone(candidate))>>>0))!==0){
        candidate=(candidate^inputToggles[level])>>>0;
      }
    }
    if(clone(candidate)!==(target>>>0))throw new Error('exact cubic flag final equality failed');
    return candidate>>>0;
  }
  return{invert,outputMasks,inputToggles,offlineContractions,offlineCoefficientVectors};
}


/**
 * Target-independent exact cubic derivative flag using incremental
 * mixed-coefficient transport, rather than re-contracting polynomial
 * directions after every greedy kernel split. The base table is read
 * directly from the public ANF. For each U basis vector u_p, maintain:
 *
 * L[p][i] = coefficient of x_i in Z(x,u_p)
 * Q[p][i,j] = coefficient of x_i*x_j in Z(x,u_p)
 * C[p][q][i] = L_i(u_p xor u_q) xor L_i(u_p) xor L_i(u_q)
 *
 * For v_j=u_j xor a_j*u_pivot, exact transport laws are:
 * L'_j = L_j xor a_j*(L_pivot xor C_j,pivot)
 * Q'_j = Q_j xor a_j*Q_pivot
 * C'_j,k = C_j,k xor a_j*C_pivot,k xor a_k*C_j,pivot.
 * They follow from the degree bounds L quadratic and Q linear in v.
 *
 * @param {CubicModel} model
 * @returns {{invert:(target:number)=>number,outputMasks:number[],
 *   inputToggles:number[],offlineCoefficientVectors:number,
 *   tensorTransportXors:number,initialAnfTerms:number}}
 */
function prepareExactCubicTransportInverter(model){
  // Reuse canonical full-table validation before constructing tensors.
  makeCubicDefectContractor(model);

  /** @type {Uint32Array[]} */
  let L=Array.from({length:WIDTH},()=>new Uint32Array(WIDTH));
  /** @type {Uint32Array[]} */
  let Q=Array.from({length:WIDTH},()=>new Uint32Array(WIDTH*WIDTH));
  /** @type {Uint32Array[][]} */
  let C=Array.from({length:WIDTH},()=>
    Array.from({length:WIDTH},()=>new Uint32Array(WIDTH)));
  let initialAnfTerms=0;
  for(const [maskRaw,coefficientRaw] of model.coefficients){
    const mask=maskRaw>>>0,coefficient=coefficientRaw>>>0;
    if(coefficient===0)continue;
    /** @type {number[]} */
    const bits=[];
    for(let i=0;i<WIDTH;i++)if(((mask>>>i)&1)!==0)bits.push(i);
    if(bits.length===2){
      const [i,j]=bits;
      L[i][j]^=coefficient;
      L[j][i]^=coefficient;
      initialAnfTerms++;
    }else if(bits.length===3){
      const [i,j,k]=bits;
      Q[i][j*WIDTH+k]^=coefficient;
      Q[j][i*WIDTH+k]^=coefficient;
      Q[k][i*WIDTH+j]^=coefficient;
      C[i][j][k]^=coefficient;
      C[j][i][k]^=coefficient;
      C[i][k][j]^=coefficient;
      C[k][i][j]^=coefficient;
      C[j][k][i]^=coefficient;
      C[k][j][i]^=coefficient;
      initialAnfTerms++;
    }
  }

  /** @param {number} input @returns {number} */
  const clone=input=>evaluateBoundedDegreeModel(model,input>>>0)>>>0;
  const base=clone(0);
  let inputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  let outputBasis=Array.from({length:WIDTH},(_,i)=>(2**i)>>>0);
  /** @type {number[]} */
  const outputMasks=[];
  /** @type {number[]} */
  const inputToggles=[];
  let offlineCoefficientVectors=0,tensorTransportXors=0;
  for(let level=0;level<WIDTH;level++){
    const k=inputBasis.length;
    const defects=[];
    for(let p=0;p<k;p++){
      for(let i=0;i<WIDTH;i++){
        defects.push(L[p][i]);
        offlineCoefficientVectors++;
      }
      for(let i=0;i<WIDTH;i++){
        for(let j=i+1;j<WIDTH;j++){
          defects.push(Q[p][i*WIDTH+j]);
          offlineCoefficientVectors++;
        }
      }
    }
    for(let p=0;p<k;p++){
      for(let q=p+1;q<k;q++){
        for(let i=0;i<WIDTH;i++){
          defects.push(C[p][q][i]);
          offlineCoefficientVectors++;
        }
      }
    }
    const candidates=independentRestrictions(orthogonalComplement(spanBasis(defects)),outputBasis);
    /** @type {{mask:number,inputLabels:number[],outputLabels:number[]}|null} */
    let accepted=null;
    for(const mask of candidates){
      const inputLabels=inputBasis.map(v=>parity32(mask&(clone(v)^base)));
      if(!inputLabels.includes(1))continue;
      const outputLabels=outputBasis.map(v=>parity32(mask&v));
      if(!outputLabels.includes(1))continue;
      accepted={mask,inputLabels,outputLabels};
      break;
    }
    if(accepted===null)throw new Error('exact cubic tensor flag has no nonzero mask at level '+level);
    const inPivot=accepted.inputLabels.indexOf(1);
    const outPivot=accepted.outputLabels.indexOf(1);
    const inToggle=inputBasis[inPivot];
    const outToggle=outputBasis[outPivot];
    const survivors=Array.from({length:k},(_,index)=>index)
      .filter(index=>index!==inPivot);
    const nextInput=survivors.map(index=>
      (inputBasis[index]^(accepted.inputLabels[index]?inToggle:0))>>>0);
    const nextOutput=outputBasis.filter((_,index)=>index!==outPivot)
      .map((vector,index)=>{
        // Restore the original index of this output vector after removal.
        const originalIndex=index<outPivot?index:index+1;
        return(vector^(accepted.outputLabels[originalIndex]?outToggle:0))>>>0;
      });

    /** @type {Uint32Array[]} */
    const nextL=[];
    /** @type {Uint32Array[]} */
    const nextQ=[];
    /** @type {Uint32Array[][]} */
    const nextC=Array.from({length:survivors.length},()=>
      Array.from({length:survivors.length},()=>new Uint32Array(WIDTH)));

    for(const originalIndex of survivors){
      const plus=accepted.inputLabels[originalIndex]===1;
      const l=new Uint32Array(WIDTH);
      const q=new Uint32Array(WIDTH*WIDTH);
      for(let i=0;i<WIDTH;i++){
        l[i]=L[originalIndex][i];
        if(plus){
          l[i]^=L[inPivot][i]^C[originalIndex][inPivot][i];
          tensorTransportXors+=2;
        }
      }
      for(let index=0;index<WIDTH*WIDTH;index++){
        q[index]=Q[originalIndex][index];
        if(plus){
          q[index]^=Q[inPivot][index];
          tensorTransportXors++;
        }
      }
      nextL.push(l);nextQ.push(q);
    }

    for(let a=0;a<survivors.length;a++){
      const oldA=survivors[a],plusA=accepted.inputLabels[oldA]===1;
      for(let b=a+1;b<survivors.length;b++){
        const oldB=survivors[b],plusB=accepted.inputLabels[oldB]===1;
        for(let i=0;i<WIDTH;i++){
          let value=C[oldA][oldB][i];
          if(plusA){value^=C[inPivot][oldB][i];tensorTransportXors++;}
          if(plusB){value^=C[oldA][inPivot][i];tensorTransportXors++;}
          nextC[a][b][i]=value;
          nextC[b][a][i]=value;
        }
      }
    }
    inputBasis=nextInput;outputBasis=nextOutput;
    L=nextL;Q=nextQ;C=nextC;
    outputMasks.push(accepted.mask);
    inputToggles.push(inToggle);
  }

  /** @param {number} target @returns {number} */
  function invert(target){
    let candidate=0;
    for(let level=0;level<WIDTH;level++){
      if(parity32(outputMasks[level]&((target^clone(candidate))>>>0))!==0){
        candidate=(candidate^inputToggles[level])>>>0;
      }
    }
    if(clone(candidate)!==(target>>>0)){
      throw new Error('exact cubic tensor flag final equality failed');
    }
    return candidate>>>0;
  }
  return{
    invert,outputMasks,inputToggles,
    offlineCoefficientVectors,tensorTransportXors,initialAnfTerms
  };
}


module.exports={makeCubicDefectContractor,prepareExactCubicInverter,prepareExactCubicTransportInverter};
