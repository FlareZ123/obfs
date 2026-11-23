'use strict';
const assert=require('node:assert/strict');

/**
 * Exact adaptive chosen-query minimax inverse game for the complete
 * three-bit rank-one-permutation source family:
 *
 *   F(x) = c XOR A*x XOR w*f(x),
 *
 * A is any invertible GF(2)^3 linear map, w nonzero, c arbitrary, and f is
 * any scalar control invariant along u=A^-1 w. Every such F is a permutation.
 *
 * The model class is the UNIQUE functional quotient of all parameter choices.
 * This enumerates ALL possible chosen outputs and ALL decision-tree queries,
 * not a random attacker heuristic. No source labels or hidden model parameters
 * are given to the attacker, only a chosen forward oracle and target y.
 */

/** @param {number[]} columns @param {number} input @returns {number} */
function linear(columns,input) {
  return ((input&1)?columns[0]:0)^
    ((input&2)?columns[1]:0)^
    ((input&4)?columns[2]:0);
}

/** @returns {Uint32Array} */
function enumerateFamily() {
  /** @type {Set<number>} */
  const unique=new Set();
  let validLinearMaps=0,parameterized=0;
  for(let a=1;a<8;a++)for(let b=1;b<8;b++)for(let c=1;c<8;c++){
    const columns=[a,b,c];
    const linearOutputs=Array.from({length:8},(_,x)=>linear(columns,x));
    if(new Set(linearOutputs).size!==8)continue;
    validLinearMaps++;
    const inverse=Array(8).fill(0);
    for(let x=0;x<8;x++)inverse[linearOutputs[x]]=x;
    for(let w=1;w<8;w++){
      const u=inverse[w];
      assert.ok(u>=1);
      const pairs=Array(8).fill(-1);
      let pairCount=0;
      for(let x=0;x<8;x++) {
        if(pairs[x]!==-1)continue;
        pairs[x]=pairs[x^u]=pairCount++;
      }
      assert.equal(pairCount,4);
      for(let f=0;f<16;f++){
        const values=linearOutputs.map((value,x)=>
          value^(((f>>>pairs[x])&1)?w:0));
        assert.equal(new Set(values).size,8);
        for(let offset=0;offset<8;offset++){
          let packed=0;
          for(let x=0;x<8;x++)packed|=(values[x]^offset)<<(3*x);
          unique.add(packed>>>0);
          parameterized++;
        }
      }
    }
  }
  assert.equal(validLinearMaps,168);
  assert.equal(parameterized,150528);
  assert.equal(unique.size,10752);
  return Uint32Array.from([...unique].sort((a,b)=>a-b));
}

/** @param {number} packed @param {number} x @returns {number} */
function observe(packed,x) {
  return (packed>>>(3*x))&7;
}

/**
 * @param {Uint32Array} family
 * @returns {{outputs:bigint[][],preimages:bigint[],full:bigint}}
 */
function modelMasks(family) {
  /** @type {bigint[][]} */
  const outputs=Array.from({length:8},()=>Array(8).fill(0n));
  /** @type {bigint[]} */
  const preimages=Array(8).fill(0n);
  for(let i=0;i<family.length;i++){
    const bit=1n<<BigInt(i);
    const packed=family[i];
    for(let x=0;x<8;x++){
      const value=observe(packed,x);
      outputs[x][value]|=bit;
      if(value===0)preimages[x]|=bit;
    }
  }
  return {outputs,preimages,full:(1n<<BigInt(family.length))-1n};
}

/**
 * Exhaustive AND/OR game: attacker chooses x; adversary chooses any response
 * consistent with at least one remaining source. A state is terminal only if
 * every remaining source has the SAME unique preimage of published output 0.
 *
 * @param {{outputs:bigint[][],preimages:bigint[],full:bigint}} model
 * @returns {{canWin:(state:bigint,used:number,depth:number)=>boolean,
 *   choice:(state:bigint,used:number,depth:number)=>number,
 *   states:()=>number}}
 */
function minimax(model) {
  /** @type {Map<string,{possible:boolean,choice:number}>} */
  const memo=new Map();
  /** @param {bigint} state @returns {number} */
  function commonPreimage(state) {
    assert.ok(state!==0n);
    for(let x=0;x<8;x++){
      if((state & ~model.preimages[x])===0n)return x;
    }
    return -1;
  }
  /** @param {bigint} state @param {number} used @param {number} depth @returns {{possible:boolean,choice:number}} */
  function search(state,used,depth) {
    const fixed=commonPreimage(state);
    if(fixed>=0)return {possible:true,choice:-1};
    if(depth===0)return {possible:false,choice:-2};
    const key=state.toString(16)+'|'+used+'|'+depth;
    const old=memo.get(key);
    if(old!==undefined)return old;
    for(let x=0;x<8;x++){
      if((used>>>x)&1)continue;
      let wins=true;
      for(let value=0;value<8;value++){
        const branch=state & model.outputs[x][value];
        if(branch!==0n && !search(branch,used|(1<<x),depth-1).possible) {
          wins=false;
          break;
        }
      }
      if(wins){
        const result={possible:true,choice:x};
        memo.set(key,result);
        return result;
      }
    }
    const result={possible:false,choice:-2};
    memo.set(key,result);
    return result;
  }
  return {
    canWin:(state,used,depth)=>search(state,used,depth).possible,
    choice:(state,used,depth)=>search(state,used,depth).choice,
    states:()=>memo.size
  };
}

/**
 * @returns {{
 *   uniquePermutations:number,parameterizedForms:number,
 *   targetCases:number,exactInversions:number,minimaxWorstQueries:number,
 *   fourQueriesSuffice:boolean,fiveQueriesSuffice:boolean,
 *   queryHistogram:number[],decisionStates:number
 * }}
 */
function runWidthThreeRankOneMinimax() {
  const family=enumerateFamily();
  const model=modelMasks(family);
  const strategy=minimax(model);
  const fourQueriesSuffice=strategy.canWin(model.full,0,4);
  const fiveQueriesSuffice=strategy.canWin(model.full,0,5);
  assert.equal(fourQueriesSuffice,false);
  assert.equal(fiveQueriesSuffice,true);
  /** @type {number[]} */
  const queryHistogram=Array(6).fill(0);
  let exactInversions=0,minimaxWorstQueries=0;
  for(const packed of family){
    for(let target=0;target<8;target++){
      // The family is closed under XOR by an arbitrary output constant.
      // Normalize every published target to output zero without information
      // about the source, so the same single policy covers all target values.
      let state=model.full,used=0,depth=5,queries=0;
      let recovered=-1;
      while(true){
        const preimageIndex=model.preimages.findIndex(c=>
          (state & ~c)===0n);
        if(preimageIndex>=0){
          recovered=preimageIndex;
          break;
        }
        const choice=strategy.choice(state,used,depth);
        assert.ok(choice>=0 && choice<8 && depth>0);
        const observed=observe(packed,choice)^target;
        state &= model.outputs[choice][observed];
        assert.ok(state!==0n);
        queries++;
        used|=1<<choice;
        depth--;
      }
      assert.equal(observe(packed,recovered),target);
      assert.ok(queries>=1&&queries<=5);
      queryHistogram[queries]++;
      minimaxWorstQueries=Math.max(minimaxWorstQueries,queries);
      exactInversions++;
    }
  }
  assert.equal(exactInversions,86016);
  assert.equal(minimaxWorstQueries,5);
  assert.deepEqual(queryHistogram,[0,10752,10752,10752,14784,38976]);
  return {
    uniquePermutations:family.length,parameterizedForms:150528,
    targetCases:family.length*8,exactInversions,minimaxWorstQueries,
    fourQueriesSuffice,fiveQueriesSuffice,queryHistogram,
    decisionStates:strategy.states()
  };
}

if(require.main===module){
  process.stdout.write('RANKONE_WIDTH3_MINIMAX '+JSON.stringify(
    runWidthThreeRankOneMinimax())+'\n');
}
module.exports={enumerateFamily,runWidthThreeRankOneMinimax};
