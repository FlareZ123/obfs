'use strict';

const WIDTH=3;
const SIZE=1<<WIDTH;
const MASK=SIZE-1;

/** @param {number} value @returns {number} */
function parity(value){
  let x=value;
  let result=0;
  while(x){result^=x&1;x>>>=1;}
  return result;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input){
  let output=0;
  for(let bit=0;bit<WIDTH;bit+=1){
    if((input>>>bit)&1)output^=columns[bit];
  }
  return output&MASK;
}

/** @param {number[]} vectors @returns {number[]} */
function makeSpanBasis(vectors){
  const pivots=Array(WIDTH).fill(0);
  for(const raw of vectors){
    let value=raw&MASK;
    for(let bit=WIDTH-1;bit>=0&&value!==0;bit-=1){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value^=pivots[bit];
      else{pivots[bit]=value;break;}
    }
  }
  return pivots;
}

/** @param {number} value @param {number[]} pivots @returns {boolean} */
function isInSpan(value,pivots){
  let current=value&MASK;
  for(let bit=WIDTH-1;bit>=0&&current!==0;bit-=1){
    if(((current>>>bit)&1)===0)continue;
    if(pivots[bit]===0)return false;
    current^=pivots[bit];
  }
  return current===0;
}

/** @param {(x:number)=>number} oracle @param {number} target @returns {number} */
function invertOuter(oracle,target){
  const base=oracle(0);
  const deltas=Array.from({length:WIDTH},(_,bit)=>base^oracle(1<<bit));
  const suffixSpans=Array(WIDTH+1);
  suffixSpans[WIDTH]=makeSpanBasis([]);
  for(let bit=WIDTH-1;bit>=0;bit-=1){
    suffixSpans[bit]=makeSpanBasis(deltas.slice(bit));
  }
  let prefix=0;
  for(let bit=0;bit<WIDTH;bit+=1){
    if(!isInSpan(target^oracle(prefix),suffixSpans[bit+1])){
      prefix|=1<<bit;
    }
  }
  return prefix;
}

/** @param {(x:number)=>number} oracle @returns {number[]} */
function learnInnerToggles(oracle){
  const base=oracle(0);
  let basis=Array.from({length:WIDTH},(_,bit)=>1<<bit);
  const toggles=[];
  for(let bit=0;bit<WIDTH;bit+=1){
    const labels=basis.map(vector=>((oracle(vector)^base)>>>bit)&1);
    const pivotIndex=labels.indexOf(1);
    if(pivotIndex<0)throw new Error('missing codimension-one pivot');
    const pivot=basis[pivotIndex];
    toggles.push(pivot);
    const next=[];
    for(let index=0;index<basis.length;index+=1){
      if(index===pivotIndex)continue;
      next.push(labels[index]===0?basis[index]:basis[index]^pivot);
    }
    basis=next;
  }
  return toggles;
}

/** @param {(x:number)=>number} oracle @param {number} target @returns {number} */
function invertInner(oracle,target){
  const toggles=learnInnerToggles(oracle);
  let candidate=0;
  for(let bit=0;bit<WIDTH;bit+=1){
    const mask=(1<<(bit+1))-1;
    if((oracle(candidate)&mask)!==(target&mask)){
      candidate^=toggles[bit];
    }
  }
  return candidate;
}

/**
 * Enumerate every width-3 compatible permutation. Each output bit is the
 * matching input bit XOR an arbitrary truth table over lower input bits.
 * @param {number} code
 * @returns {number[]}
 */
function compatiblePermutation(code){
  const truthTableOffsets=[0,1,3];
  return Array.from({length:SIZE},(_,input)=>{
    let output=0;
    for(let bit=0;bit<WIDTH;bit+=1){
      const lower=input&((1<<bit)-1);
      const flip=(code>>>(truthTableOffsets[bit]+lower))&1;
      output|=((((input>>>bit)&1)^flip)<<bit);
    }
    return output;
  });
}

/** @returns {number[][]} */
function allInvertibleLinearMaps(){
  const maps=[];
  for(let a=1;a<SIZE;a++){
    for(let b=1;b<SIZE;b++){
      for(let c=1;c<SIZE;c++){
        const columns=[a,b,c];
        if(makeSpanBasis(columns).filter(Boolean).length===WIDTH)maps.push(columns);
      }
    }
  }
  return maps;
}

function main(){
  const linearMaps=allInvertibleLinearMaps();
  if(linearMaps.length!==168)throw new Error('GL(3,2) enumeration mismatch');

  let recoveries=0;
  for(let code=0;code<(1<<(SIZE-1));code+=1){
    const permutation=compatiblePermutation(code);
    if(new Set(permutation).size!==SIZE){
      throw new Error('compatible family emitted a non-permutation');
    }
    for(const linear of linearMaps){
      for(let secret=0;secret<SIZE;secret+=1){
        /** @param {number} input @returns {number} */
        const outer=input=>applyLinear(linear,permutation[input]);
        if(invertOuter(outer,outer(secret))!==secret){
          throw new Error(`outer mismatch code=${code} secret=${secret}`);
        }

        /** @param {number} input @returns {number} */
        const inner=input=>permutation[applyLinear(linear,input)];
        if(invertInner(inner,inner(secret))!==secret){
          throw new Error(`inner mismatch code=${code} secret=${secret}`);
        }
        recoveries+=2;
      }
    }
  }

  console.log(JSON.stringify({
    width:WIDTH,
    compatiblePermutations:1<<(SIZE-1),
    invertibleLinearMaps:linearMaps.length,
    secretsPerMap:SIZE,
    orientations:2,
    totalExactRecoveries:recoveries,
    result:'all exact'
  }));
}

if(require.main===module)main();
