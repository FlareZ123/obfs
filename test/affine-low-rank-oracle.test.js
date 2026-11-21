'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertLowRankPermutation}=require('../sims/affine-low-rank-oracle');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number[]} columns @param {number} input @returns {number} */
function linear(columns,input){
  let result=0;
  for(let i=0;i<columns.length;i++)if((input>>>i)&1)result^=columns[i];
  return result>>>0;
}

/**
 * Build an invertible linear map through elementary column additions.
 * @param {number} bits
 * @param {()=>number} next
 * @returns {number[]}
 */
function invertible(bits,next){
  const columns=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let step=0;step<16*bits;step++){
    const a=next()%bits;
    const b=(a+1+next()%(bits-1))%bits;
    columns[a]=(columns[a]^columns[b])>>>0;
  }
  return columns;
}

/** @param {number} width @param {number} seed @returns {()=>number} */
function cycling(width,seed){
  const domain=2**width;
  let next=seed%domain;
  return ()=>{
    const value=next;
    next=(next+1)%domain;
    return value;
  };
}

/**
 * Reproduce the observed exact input, independently comparing all oracle
 * outputs to a direct held-out reference. The attacker sees only the oracle.
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {number} rankBound
 * @param {number} expectedInput
 * @param {number} seed
 * @returns {import('../sims/affine-low-rank-oracle').InversionResult}
 */
function verify(oracle,bits,rankBound,expectedInput,seed){
  const target=oracle(expectedInput);
  const result=invertLowRankPermutation(oracle,target,{
    bits,rankBound,sample:cycling(bits,seed),maxSamples:2**bits
  });
  assert.equal(result.preimage,expectedInput);
  assert.equal(oracle(result.preimage),target);
  assert.ok(result.nullity<=rankBound);
  assert.ok(result.orbitCalls<=2**rankBound);
  assert.equal(result.oracleCalls,bits+1+result.samplingCalls+result.orbitCalls);
  return result;
}

/**
 * Fill an otherwise arbitrary permutation with forced images of basis inputs.
 * @param {number} bits
 * @returns {number[]}
 */
function forcedSingular(bits){
  const domain=2**bits;
  const positions=[0,...Array.from({length:bits},(_,i)=>1<<i)];
  const values=new Array(domain).fill(-1);
  for(let i=0;i<positions.length;i++)values[positions[i]]=i;
  const used=new Set(values.filter(x=>x>=0));
  let next=0;
  for(let i=0;i<domain;i++){
    if(values[i]>=0)continue;
    while(used.has(next))next++;
    values[i]=next++;
  }
  return values;
}

test('singular interpolants of nullity one, two, and three still invert exactly',()=>{
  for(const [bits,expectedNullity] of [[3,1],[5,2],[6,3]]){
    const outputs=forcedSingular(bits);
    assert.equal(new Set(outputs).size,2**bits);
    for(let input=0;input<outputs.length;input++){
      const outcome=verify(x=>outputs[x],bits,bits,input,input+17);
      assert.equal(outcome.nullity,expectedNullity);
    }
  }
});

/**
 * @param {number[]} values
 * @returns {number[][]}
 */
function permutations(values){
  if(values.length===0)return [[]];
  /** @type {number[][]} */
  const output=[];
  for(let index=0;index<values.length;index++){
    const head=values[index];
    for(const suffix of permutations(values.filter((_,i)=>i!==index)))
      output.push([head,...suffix]);
  }
  return output;
}

test('exhaustive 576 arbitrary rank-two fiber permutation pairs',()=>{
  const perms=permutations([0,1,2,3]);
  let verified=0;
  for(const left of perms)for(const right of perms){
    const outputs=[...left,...right.map(x=>x+4)];
    for(let input=0;input<8;input++){
      verify(x=>outputs[x],3,2,input,input+7);
      verified++;
    }
  }
  assert.equal(verified,4608);
});

test('all 40,320 permutations of three bits and all eight inverse targets',()=>{
  let verified=0;
  for(const outputs of permutations([0,1,2,3,4,5,6,7])){
    for(let input=0;input<8;input++){
      verify(x=>outputs[x],3,3,input,7+input);
      verified++;
    }
  }
  assert.equal(verified,322560);
});

test('independent hidden matrices and random per-fiber permutations',()=>{
  const random=seeded(0x6018b2ab);
  let verified=0;
  for(let bits=3;bits<=7;bits++){
    for(let rank=1;rank<=Math.min(3,bits);rank++){
      for(let caseIndex=0;caseIndex<36;caseIndex++){
        const incoming=invertible(bits,random);
        const outgoing=invertible(bits,random);
        const constOutput=random()%(2**bits);
        const fiberSize=2**rank;
        const fibres=Array.from({length:2**(bits-rank)},()=>{
          const values=Array.from({length:fiberSize},(_,i)=>i);
          for(let i=fiberSize-1;i>0;i--){
            const j=random()%(i+1);
            [values[i],values[j]]=[values[j],values[i]];
          }
          return values;
        });
        /** @param {number} x @returns {number} */
        const oracle=x=>{
          const intermediate=linear(incoming,x);
          const upper=intermediate>>>rank;
          const lower=intermediate&(fiberSize-1);
          const permuted=(upper*2**rank)|fibres[upper][lower];
          return (linear(outgoing,permuted)^constOutput)>>>0;
        };
        for(let x=0;x<2**bits;x++){
          verify(oracle,bits,rank,x,caseIndex*91+x);
          verified++;
        }
      }
    }
  }
  assert.ok(verified>11000);
});

/** @param {number} value @returns {number} */
function diffuse(value){
  let x=value>>>0;
  x^=x>>>16;
  x=Math.imul(x,0x7feb352d);
  x^=x>>>15;
  x=Math.imul(x,0x846ca68b);
  x^=x>>>16;
  return x>>>0;
}

test('32-bit hidden GF(2) coordinates, three-dimensional nonlinearity',()=>{
  const random=seeded(0x5c39e11f);
  for(let caseIndex=0;caseIndex<40;caseIndex++){
    const incoming=invertible(32,random);
    const outgoing=invertible(32,random);
    const offset=random();
    /** @param {number} value @returns {number} */
    const oracle=value=>{
      const mapped=linear(incoming,value);
      const fiber=mapped>>>3;
      const control=diffuse(fiber^offset);
      const odd=(control&7)|1;
      const shift=(control>>>8)&7;
      const low=(Math.imul(odd,mapped&7)+shift)&7;
      const changed=((fiber<<3)|low)>>>0;
      return (linear(outgoing,changed)^offset)>>>0;
    };
    for(const input of [0,1,0x80000000,0xffffffff,random(),random()]){
      const target=oracle(input);
      const result=invertLowRankPermutation(oracle,target,{
        bits:32,rankBound:3,maxSamples:128
      });
      assert.equal(result.preimage,input);
      assert.ok(result.oracleCalls<=32+1+128+8);
    }
  }
});

test('all 331,776 four-fiber rank-two permutations at width four',()=>{
  const p=permutations([0,1,2,3]);
  let verified=0;
  for(const a of p)for(const b of p)for(const c of p)for(const d of p){
    const outputs=[...a,...b.map(x=>x+4),...c.map(x=>x+8),...d.map(x=>x+12)];
    for(let input=0;input<16;input++){
      verify(x=>outputs[x],4,2,input,input+11);
      verified++;
    }
  }
  assert.equal(verified,5308416);
});
