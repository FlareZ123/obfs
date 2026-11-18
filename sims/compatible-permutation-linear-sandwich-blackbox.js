'use strict';

const MASK32N=(1n<<32n)-1n;

/** @param {number} value @returns {number} */
function u32(value){return value>>>0;}
/** @param {bigint} value @returns {bigint} */
function u32n(value){return value&MASK32N;}
/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}
/** @param {number} seed @returns {()=>number} */
function makeRng(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/** @param {number} bit @returns {number} */
function bitValue(bit){return u32(2**bit);}

/** @param {number[]} vectors @returns {number[]} */
function makeSpanBasis(vectors){
  const pivots=Array(32).fill(0);
  for(const raw of vectors){
    let value=raw>>>0;
    for(let bit=31;bit>=0&&value!==0;bit-=1){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value=u32(value^pivots[bit]);
      else{pivots[bit]=value;break;}
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
  for(let col=0;col<32;col+=1){
    let selected=-1;
    for(let row=rank;row<matrix.length;row+=1){
      if(((matrix[row]>>>col)&1)!==0){selected=row;break;}
    }
    if(selected<0)continue;
    [matrix[rank],matrix[selected]]=[matrix[selected],matrix[rank]];
    const pivot=matrix[rank];
    for(let row=0;row<matrix.length;row+=1){
      if(row!==rank&&((matrix[row]>>>col)&1)!==0)matrix[row]=u32(matrix[row]^pivot);
    }
    pivots.push(col);
    rank+=1;
    if(rank===matrix.length)break;
  }
  matrix.length=rank;
  const pivotSet=new Set(pivots);
  const result=[];
  for(let free=0;free<32;free+=1){
    if(pivotSet.has(free))continue;
    let mask=bitValue(free);
    for(let row=0;row<rank;row+=1){
      if(parity32(matrix[row]&mask)!==0)mask=u32(mask|bitValue(pivots[row]));
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
    for(let index=0;index<outputBasis.length;index+=1){
      if(parity32(candidate&outputBasis[index])!==0)signature=u32(signature|bitValue(index));
    }
    let mask=candidate;
    for(let bit=outputBasis.length-1;bit>=0;bit-=1){
      if(((signature>>>bit)&1)===0)continue;
      const prior=pivots.get(bit);
      if(prior){signature=u32(signature^prior.signature);mask=u32(mask^prior.mask);}
      else{pivots.set(bit,{signature,mask});result.push(mask);break;}
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

/** @param {number[]} basis @param {()=>number} next @returns {number} */
function randomVector(basis,next){
  let value=0;
  for(const vector of basis)if((next()&1)!==0)value=u32(value^vector);
  return value;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input){
  let x=input>>>0;let output=0;let bit=0;
  while(x!==0){if((x&1)!==0)output^=columns[bit];x>>>=1;bit+=1;}
  return output>>>0;
}

/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed){
  const next=makeRng(seed);
  const columns=Array.from({length:32},(_,bit)=>bitValue(bit));
  for(let round=0;round<512;round+=1){
    const a=next()%32;let b=next()%32;if(a===b)b=(b+1)%32;
    if((next()&1)===0)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[b]=u32(columns[b]^columns[a]);
  }
  return columns;
}

/** @param {number} seed @returns {(input:number)=>number} */
function makeTriangularCompatiblePermutation(seed){
  const next=makeRng(seed);
  const specs=Array.from({length:32},(_,bit)=>{
    const lowerMask=bit===0?0:u32((2**bit)-1);
    return{a:next()&lowerMask,b:next()&lowerMask,c:next()&lowerMask,constant:next()&1};
  });
  return(input)=>{
    const x=input>>>0;let output=0;
    for(let bit=0;bit<32;bit+=1){
      const lowerMask=bit===0?0:u32((2**bit)-1);
      const lower=x&lowerMask;const spec=specs[bit];
      const nonlinear=parity32(lower&spec.a)^(parity32(lower&spec.b)&parity32(lower&spec.c))^spec.constant;
      if((((x>>>bit)&1)^nonlinear)!==0)output=u32(output+bitValue(bit));
    }
    return output>>>0;
  };
}

/** @param {number} degree @param {number} seed @returns {(input:number)=>number} */
function makeRivestPermutation(degree,seed){
  const next=makeRng(seed);
  const coefficients=Array.from({length:degree+1},()=>BigInt(next()));
  coefficients[1]|=1n;
  let evenParity=0n;for(let i=2;i<=degree;i+=2)evenParity^=coefficients[i]&1n;
  if(evenParity!==0n)coefficients[2]^=1n;
  let oddParity=0n;for(let i=3;i<=degree;i+=2)oddParity^=coefficients[i]&1n;
  if(oddParity!==0n)coefficients[3]^=1n;
  return(input)=>{
    const x=BigInt(input>>>0);let value=0n;
    for(let i=degree;i>=0;i-=1)value=u32n(value*x+coefficients[i]);
    return Number(value)>>>0;
  };
}

/**
 * Practical CEGAR inverter for F(x)=Lout(P(Lin(x))).
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} seed
 * @returns {{value:number,queryCount:number,refinements:number}}
 */
function invertLinearSandwich(oracle,target,seed){
  const next=makeRng(seed);
  /** @type {Map<number,number>} */
  const cache=new Map();
  const query=(input)=>{
    const key=input>>>0;const prior=cache.get(key);if(prior!==undefined)return prior;
    const value=oracle(key)>>>0;cache.set(key,value);return value;
  };
  const base=query(0);
  let inputBasis=Array.from({length:32},(_,bit)=>bitValue(bit));
  let outputBasis=[...inputBasis];
  /** @type {number[]} */
  const outputMasks=[];
  /** @type {number[]} */
  const inputToggles=[];
  let refinements=0;

  for(let level=0;level<32;level+=1){
    const defects=[];
    for(let sample=0;sample<32;sample+=1){
      let direction=0;
      while(direction===0)direction=randomVector(inputBasis,next);
      const point=next();
      defects.push(u32(query(point)^query(point^direction)^base^query(direction)));
    }

    /** @type {{mask:number,inputLabels:number[]}|null} */
    let accepted=null;
    for(let attempt=0;attempt<256&&accepted===null;attempt+=1){
      const defectBasis=makeSpanBasis(defects);
      const candidates=independentRestrictions(orthogonalComplement(defectBasis),outputBasis);
      if(candidates.length===0)throw new Error(`no output functional at level ${level}`);
      let counterexample=0;
      for(const mask of candidates){
        const inputLabels=inputBasis.map(vector=>parity32(mask&u32(query(vector)^base)));
        if(!inputLabels.includes(1))continue;
        let valid=true;
        for(let trial=0;trial<128;trial+=1){
          const direction=randomVector(inputBasis,next);
          const point=next();
          const defect=u32(query(point)^query(point^direction)^base^query(direction));
          if(parity32(mask&defect)!==0){valid=false;counterexample=defect;break;}
        }
        if(valid){accepted={mask,inputLabels};break;}
      }
      if(accepted===null){
        if(counterexample===0)throw new Error(`no validated output functional at level ${level}`);
        defects.push(counterexample);refinements+=1;
      }
    }
    if(accepted===null)throw new Error(`CEGAR refinement limit at level ${level}`);

    const outputLabels=outputBasis.map(vector=>parity32(accepted.mask&vector));
    const outputSplit=splitKernel(outputBasis,outputLabels);
    const inputSplit=splitKernel(inputBasis,accepted.inputLabels);
    outputBasis=outputSplit.basis;
    inputBasis=inputSplit.basis;
    outputMasks.push(accepted.mask);
    inputToggles.push(inputSplit.toggle);
  }

  let candidate=0;
  for(let level=0;level<32;level+=1){
    if(parity32(outputMasks[level]&u32(target^query(candidate)))!==0){
      candidate=u32(candidate^inputToggles[level]);
    }
  }
  if(query(candidate)!==(target>>>0))throw new Error('sandwich inversion failed final equality');
  return{value:candidate>>>0,queryCount:cache.size,refinements};
}

function main(){
  const families=[
    {name:'nonlinear-triangular',make:(seed)=>makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-degree-3',make:(seed)=>makeRivestPermutation(3,seed)},
    {name:'rivest-degree-7',make:(seed)=>makeRivestPermutation(7,seed)},
  ];
  const rows=[];let total=0;
  for(const family of families){
    const queries=[];const refinements=[];
    for(let caseIndex=0;caseIndex<64;caseIndex+=1){
      const salt=family.name.split('').reduce((value,ch)=>u32(Math.imul(value^ch.charCodeAt(0),0x01000193)),0x811c9dc5);
      const seed=u32(0x6a09e667^salt^caseIndex);
      const permutation=family.make(seed);
      const inner=makeLinearTransform(seed^0xbb67ae85);
      const outer=makeLinearTransform(seed^0x3c6ef372);
      /** @param {number} input @returns {number} */
      const oracle=input=>applyLinear(outer,permutation(applyLinear(inner,input)));
      const secret=makeRng(seed^0xa54ff53a)();
      const target=oracle(secret);
      const attack=invertLinearSandwich(oracle,target,seed^0x510e527f);
      if(attack.value!==secret)throw new Error(`${family.name} recovery mismatch case ${caseIndex}`);
      queries.push(attack.queryCount);refinements.push(attack.refinements);total+=1;
    }
    rows.push({family:family.name,cases:64,minQueries:Math.min(...queries),maxQueries:Math.max(...queries),minRefinements:Math.min(...refinements),maxRefinements:Math.max(...refinements)});
  }
  console.log(JSON.stringify({
    model:'chosen-query CEGAR inversion of Lout(P(Lin(x))) with two unknown dense 32x32 GF(2) maps',
    result:`all ${total} published targets inverted exactly`,
    rows,
    scope:'empirical structured-family attack; 128 fresh checks per accepted linear component, not a theorem for arbitrary adversarial compatible P'
  },null,2));
}

if(require.main===module)main();
module.exports={invertLinearSandwich};
