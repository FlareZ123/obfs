'use strict';

const assert=require('node:assert/strict');

/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input) {
  let result=0;
  for(let bit=0;bit<3;bit++)if((input>>>bit)&1)result^=columns[bit];
  return result;
}

/** @param {number[]} columns @returns {number} */
function rank3(columns) {
  const pivots=[0,0,0];
  let rank=0;
  for(const raw of columns) {
    let vector=raw;
    for(let bit=2;bit>=0&&vector!==0;bit--) {
      if(!((vector>>>bit)&1))continue;
      if(pivots[bit])vector^=pivots[bit];
      else{pivots[bit]=vector;rank++;break;}
    }
  }
  return rank;
}

/** @returns {number[][]} */
function allLinear3() {
  /** @type {number[][]} */
  const matrices=[];
  for(let a=1;a<8;a++)for(let b=1;b<8;b++)for(let c=1;c<8;c++) {
    const cols=[a,b,c];
    if(rank3(cols)===3)matrices.push(cols);
  }
  assert.equal(matrices.length,168);
  return matrices;
}

/**
 * Every compatible 3-bit permutation is specified by one lower-bit-0
 * toggle, two bit-1 toggles conditioned on bit 0, and four bit-2 toggles
 * conditioned on lower bits 0 and 1, for 2^(1+2+4)=128 choices.
 * @param {number} config
 * @param {number} input
 * @returns {number}
 */
function compatible3(config,input) {
  const low0=(config&1);
  const low1=(config>>>(1+(input&1)))&1;
  const low2=(config>>>(3+(input&3)))&1;
  return input^(low0?1:0)^(low1?2:0)^(low2?4:0);
}

/**
 * Separate width-three implementation of affine interpolation followed by
 * a bounded triangular fixed-point correction. Uses brute-force inverse
 * lookup, not the 32-bit Gaussian solver under review.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queries:number,corrections:number}}
 */
function invert3(oracle,target) {
  const seen=new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const existing=seen.get(input);
    if(existing!==undefined)return existing;
    const output=oracle(input);
    seen.set(input,output);
    return output;
  }
  const base=query(0);
  const cols=[query(1)^base,query(2)^base,query(4)^base];
  const inv=Array(8).fill(-1);
  for(let x=0;x<8;x++) {
    const image=apply(cols,x);
    if(inv[image]>=0)throw new Error('Interpolated map is rank deficient');
    inv[image]=x;
  }
  let candidate=inv[target^base];
  for(let step=0;step<=3;step++) {
    const current=query(candidate);
    if(current===target)return {value:candidate,queries:seen.size,corrections:step};
    if(step===3)break;
    candidate^=inv[current^target];
  }
  throw new Error('Three-bit triangular correction did not converge');
}

/**
 * Exhaust all 128 compatible permutations, all 168 inner linear maps,
 * two independent outer maps, two inner offsets, and all eight targets,
 * conditional on source-verified clean affine anchors. Every admitted
 * case is tested. This is independent low-width reproduction of the
 * conditional 2n+2 query theorem.
 *
 * @returns {{permutations:number,innerLinearMaps:number,outerMaps:number,
 *   inputOffsets:number,cleanConfigurations:number,dirtyConfigurations:number,
 *   exactRecoveries:number,maxQueries:number,maxCorrections:number,
 *   nontrivialCleanConfigurations:number}}
 */
function runWidth3() {
  const linear=allLinear3();
  const outers=[linear[0],linear[84]];
  const offsets=[0,5];
  let cleanConfigurations=0,dirtyConfigurations=0,exactRecoveries=0;
  let maxQueries=0,maxCorrections=0,nontrivialCleanConfigurations=0;
  for(let config=0;config<128;config++) {
    /** @param {number} z @returns {number} */
    const p=z=>compatible3(config,z);
    assert.equal(new Set(Array.from({length:8},(_,z)=>p(z))).size,8);
    for(let i=0;i<linear.length;i++) {
      const inner=linear[i];
      for(const b of offsets) {
        const first=p(b);
        const clean=inner.every(column=>(p(column^b)^first)===column);
        if(!clean){dirtyConfigurations++;continue;}
        cleanConfigurations++;
        if(Array.from({length:8},(_,x)=>p(x)^x).some(shift=>shift!==(first^b))) {
          nontrivialCleanConfigurations++;
        }
        for(let j=0;j<outers.length;j++) {
          const outer=outers[j];
          const outputOffset=(config^i^b^j)&7;
          /** @param {number} x @returns {number} */
          const oracle=x=>apply(outer,p(apply(inner,x)^b))^outputOffset;
          for(let secret=0;secret<8;secret++) {
            const target=oracle(secret);
            const actual=invert3(oracle,target);
            assert.equal(actual.value,secret,
              'width3 source='+config+', Lin='+i+', b='+b+', Lout='+j+', secret='+secret);
            assert.ok(actual.queries<=8);
            assert.ok(actual.corrections<=3);
            exactRecoveries++;
            maxQueries=Math.max(maxQueries,actual.queries);
            maxCorrections=Math.max(maxCorrections,actual.corrections);
          }
        }
      }
    }
  }
  assert.ok(cleanConfigurations>0&&dirtyConfigurations>0);
  assert.ok(nontrivialCleanConfigurations>0);
  assert.ok(exactRecoveries>1000);
  return {permutations:128,innerLinearMaps:linear.length,outerMaps:outers.length,
    inputOffsets:offsets.length,cleanConfigurations,dirtyConfigurations,
    exactRecoveries,maxQueries,maxCorrections,nontrivialCleanConfigurations};
}
if(require.main===module)console.log('SPARSE_TRIANGULAR_WIDTH3 '+JSON.stringify(runWidth3()));
module.exports={runWidth3};
