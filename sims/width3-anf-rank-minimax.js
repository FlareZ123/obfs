'use strict';
const assert=require('node:assert/strict');

/**
 * Complete three-bit permutation universe, partitioned by the GF(2)-rank of
 * NONLINEAR output ANF coefficients (monomials degree >=2). For each nested
 * class rank<=r, an exhaustive adaptive chosen-forward-query minimax game
 * decides the exact worst-case number of oracle calls to recover F^-1(0).
 *
 * These are tiny-width finite-model facts; they are NOT uniform n-bit
 * black-box complexity theorems or deployed obfuscator security estimates.
 */

/** @param {number} packed @param {number} input @returns {number} */
function response(packed,input) {
  return (packed>>>(3*input))&7;
}

/**
 * @param {number[]} perm All eight output values of a bijection.
 * @returns {number}
 */
function nonlinearOutputRank(perm) {
  const coefficient=perm.slice();
  // Binary Moebius transform yields the algebraic-normal-form coefficient
  // vector for each input monomial at index (bitset) 0..7.
  for(let bit=0;bit<3;bit++)for(let monomial=0;monomial<8;monomial++){
    if((monomial>>>bit)&1)coefficient[monomial]^=
      coefficient[monomial^(1<<bit)];
  }
  const pivots=Array(3).fill(0);
  let rank=0;
  for(const monomial of [3,5,6,7]){
    let vector=coefficient[monomial];
    for(let bit=2;bit>=0&&vector!==0;bit--){
      if(!((vector>>>bit)&1))continue;
      if(pivots[bit])vector^=pivots[bit];
      else{pivots[bit]=vector;rank++;break;}
    }
  }
  return rank;
}

/**
 * @returns {{byRank:number[][],histogram:number[],total:number}}
 */
function classifyAllThreeBitPermutations() {
  /** @type {number[][]} */
  const byRank=Array.from({length:4},()=>[]);
  /** @type {number[]} */
  const outputs=[];
  /** @param {number} used */
  function walk(used) {
    if(outputs.length<8){
      for(let v=0;v<8;v++){
        if((used>>>v)&1)continue;
        outputs.push(v);
        walk(used|(1<<v));
        outputs.pop();
      }
      return;
    }
    const rank=nonlinearOutputRank(outputs);
    let packed=0;
    for(let input=0;input<8;input++)packed|=outputs[input]<<(input*3);
    byRank[rank].push(packed>>>0);
  }
  walk(0);
  const histogram=byRank.map(x=>x.length);
  const total=histogram.reduce((a,b)=>a+b,0);
  assert.equal(total,40320);
  assert.deepEqual(histogram,[1344,9408,18816,10752]);
  return {byRank,histogram,total};
}

/**
 * @param {number[]} source Encoded 3-bit permutation outputs.
 * @returns {{
 *   full:bigint,outputMasks:bigint[][],preimageMasks:bigint[]
 * }}
 */
function gameMasks(source) {
  /** @type {bigint[][]} */
  const outputMasks=Array.from({length:8},()=>Array(8).fill(0n));
  /** @type {bigint[]} */
  const preimageMasks=Array(8).fill(0n);
  for(let i=0;i<source.length;i++){
    const bit=1n<<BigInt(i);
    const packed=source[i];
    for(let input=0;input<8;input++){
      const observed=response(packed,input);
      outputMasks[input][observed]|=bit;
      if(observed===0)preimageMasks[input]|=bit;
    }
  }
  return {full:(1n<<BigInt(source.length))-1n,
    outputMasks,preimageMasks};
}

/**
 * A query is an adversarial AND over every observed output branch,
 * and a strategy choice is an OR over every as-yet unqueried input.
 * Already queried inputs cannot give extra information and are skipped.
 *
 * @param {ReturnType<typeof gameMasks>} model
 * @returns {{
 *   decide:(state:bigint,used:number,depth:number)=>{possible:boolean,query:number},
 *   states:()=>number
 * }}
 */
function strategyFor(model) {
  /** @type {Map<bigint,Map<number,{possible:boolean,query:number}>>} */
  const cache=new Map();
  /** @param {bigint} state @param {number} used @param {number} depth */
  function decide(state,used,depth) {
    assert.ok(state!==0n);
    for(let input=0;input<8;input++){
      if((state & ~model.preimageMasks[input])===0n)
        return {possible:true,query:-1};
    }
    if(depth<=0)return {possible:false,query:-2};
    const key=(used<<4)|depth;
    const existing=cache.get(state)?.get(key);
    if(existing!==undefined)return existing;
    for(let input=0;input<8;input++){
      if((used>>>input)&1)continue;
      let valid=true;
      for(let observed=0;observed<8;observed++){
        const subset=state&model.outputMasks[input][observed];
        if(subset!==0n&&!decide(subset,used|(1<<input),depth-1).possible){
          valid=false;
          break;
        }
      }
      if(valid){
        const result={possible:true,query:input};
        let bucket=cache.get(state);
        if(!bucket){bucket=new Map();cache.set(state,bucket);}
        bucket.set(key,result);
        return result;
      }
    }
    const failed={possible:false,query:-2};
    let bucket=cache.get(state);
    if(!bucket){bucket=new Map();cache.set(state,bucket);}
    bucket.set(key,failed);
    return failed;
  }
  return {decide,states:()=>[...cache.values()].reduce((sum,m)=>sum+m.size,0)};
}

/**
 * @param {number[]} source
 * @param {number} bound
 * @returns {{
 *   uniqueSources:number,lowerBound:number,upperBound:number,
 *   exactTargets:number,queryHistogram:number[],states:number
 * }}
 */
function checkClass(source,bound) {
  const model=gameMasks(source);
  const strategy=strategyFor(model);
  assert.equal(strategy.decide(model.full,0,bound-1).possible,false);
  assert.equal(strategy.decide(model.full,0,bound).possible,true);
  /** @type {number[]} */
  const queryHistogram=Array(bound+1).fill(0);
  let exactTargets=0;
  // One published target 0 per source suffices for every target y: output
  // translation F(x) XOR y preserves nonlinear ANF rank and class membership.
  // This exact simulation validates the extracted decision policy for each
  // source; the algebraic output-translation closure covers all other y.
  for(const packed of source){
    let state=model.full,used=0,remaining=bound,queries=0;
    while(true){
      const only=model.preimageMasks.findIndex(mask=>
        (state & ~mask)===0n);
      if(only>=0){
        assert.equal(response(packed,only),0);
        queryHistogram[queries]++;
        exactTargets++;
        break;
      }
      const step=strategy.decide(state,used,remaining);
      assert.equal(step.possible,true);
      assert.ok(step.query>=0&&step.query<8&&remaining>0);
      const observed=response(packed,step.query);
      state&=model.outputMasks[step.query][observed];
      assert.ok(state!==0n);
      used|=1<<step.query;
      remaining--;
      queries++;
    }
  }
  assert.equal(exactTargets,source.length);
  assert.ok(queryHistogram[bound]>0,'The optimal worst-case is attained');
  return {uniqueSources:source.length,lowerBound:bound-1,upperBound:bound,
    exactTargets,queryHistogram,states:strategy.states()};
}

/**
 * @returns {{
 *   allPermutations:number,nonlinearRankHistogram:number[],
 *   classes:{rankCeiling:number,uniqueSources:number,
 *      lowerBound:number,upperBound:number,exactTargets:number,
 *      queryHistogram:number[],states:number}[]
 * }}
 */
function runWidthThreeAnfRankMinimax() {
  const all=classifyAllThreeBitPermutations();
  /** @type {ReturnType<typeof runWidthThreeAnfRankMinimax>['classes']} */
  const classes=[];
  /** @type {number[]} */
  const nested=[];
  for(let rankCeiling=0;rankCeiling<=3;rankCeiling++){
    nested.push(...all.byRank[rankCeiling]);
    const bound=rankCeiling+4;
    const result=checkClass(nested,bound);
    classes.push({rankCeiling,...result});
  }
  assert.deepEqual(classes.map(row=>row.uniqueSources),
    [1344,10752,29568,40320]);
  assert.deepEqual(classes.map(row=>row.upperBound),[4,5,6,7]);
  assert.deepEqual(classes[0].queryHistogram,[0,168,168,336,672]);
  assert.deepEqual(classes[1].queryHistogram,[0,1344,1344,1344,1848,4872]);
  assert.deepEqual(classes[2].queryHistogram,[0,3696,3696,3696,4032,4368,10080]);
  assert.deepEqual(classes[3].queryHistogram,
    [0,5040,5040,5040,5040,5040,5040,10080]);
  return {allPermutations:all.total,nonlinearRankHistogram:all.histogram,
    classes};
}

if(require.main===module){
  process.stdout.write('WIDTH3_ANF_RANK_MINIMAX '+
    JSON.stringify(runWidthThreeAnfRankMinimax())+'\n');
}
module.exports={runWidthThreeAnfRankMinimax};
