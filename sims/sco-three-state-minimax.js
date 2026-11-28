'use strict';

const assert=require('node:assert/strict');

const MODEL_COUNT=46656;

/**
 * @typedef {{next:Uint8Array[][],output:Uint8Array[][]}} ThreeStateCorpus
 * @typedef {{count:number,classes:Uint16Array,output:Uint8Array,
 *   next:Uint16Array,root:number[]}} BehaviorQuotient
 * @typedef {{
 *   modelCount:number,behaviorClasses:number,initialClasses:number,
 *   minimaxQueries:number,noStrategyWithin23:boolean,strategyWithin24:boolean,
 *   statesAfterBudget23:{visited:number,cacheHits:number},
 *   statesAfterBudget24:{visited:number,cacheHits:number},
 *   policyNodes:number,terminalLeaves:number,maxQueries:number,
 *   totalMemoEntries:number
 * }} MinimaxResult
 */

/**
 * Enumerate every labelled three-state binary Mealy table. This also contains
 * all behaviours realizable with fewer than three states through redundant
 * or unreachable states. Every source starts in state zero.
 * @returns {ThreeStateCorpus}
 */
function enumerateThreeStateModels(){
  const next=Array.from({length:3},()=>[new Uint8Array(MODEL_COUNT),
    new Uint8Array(MODEL_COUNT)]);
  const output=Array.from({length:3},()=>[new Uint8Array(MODEL_COUNT),
    new Uint8Array(MODEL_COUNT)]);
  for(let model=0;model<MODEL_COUNT;model++){
    let code=model;
    for(let state=0;state<3;state++)for(let input=0;input<2;input++){
      const digit=code%6;
      code=Math.floor(code/6);
      next[state][input][model]=Math.floor(digit/2);
      output[state][input][model]=digit%2;
    }
  }
  return {next,output};
}

/**
 * Compute the exact future-behaviour quotient of all rooted states by
 * deterministic partition refinement. Each quotient class has a unique
 * output and successor class for both input symbols.
 * @param {ThreeStateCorpus} corpus
 * @returns {BehaviorQuotient}
 */
function refineBehaviorClasses(corpus){
  const {next,output}=corpus;
  let classes=new Uint16Array(MODEL_COUNT*3);
  for(let model=0;model<MODEL_COUNT;model++)for(let state=0;state<3;state++){
    classes[3*model+state]=output[state][0][model]+2*output[state][1][model];
  }
  let classCount=4;
  for(let round=0;round<20;round++){
    const refined=new Uint16Array(MODEL_COUNT*3);
    /** @type {Map<number,number>} */
    const signatures=new Map();
    let nextId=0;
    for(let model=0;model<MODEL_COUNT;model++)for(let state=0;state<3;state++){
      const next0=classes[3*model+next[state][0][model]];
      const next1=classes[3*model+next[state][1][model]];
      // Disjoint fields: output0, nextClass0, output1, nextClass1.
      const signature=output[state][0][model] | (next0<<1) |
        (output[state][1][model]<<15) | (next1<<16);
      let id=signatures.get(signature);
      if(id===undefined){
        id=nextId++;
        signatures.set(signature,id);
      }
      refined[3*model+state]=id;
    }
    classes=refined;
    if(nextId===classCount){
      classCount=nextId;
      break;
    }
    classCount=nextId;
  }
  assert.ok(classCount<65536);
  const classOutput=new Uint8Array(classCount*2);
  const classNext=new Uint16Array(classCount*2);
  const seen=new Uint8Array(classCount);
  for(let model=0;model<MODEL_COUNT;model++)for(let state=0;state<3;state++){
    const id=classes[3*model+state];
    const output0=output[state][0][model];
    const output1=output[state][1][model];
    const next0=classes[3*model+next[state][0][model]];
    const next1=classes[3*model+next[state][1][model]];
    if(!seen[id]){
      seen[id]=1;
      classOutput[id*2]=output0;
      classOutput[id*2+1]=output1;
      classNext[id*2]=next0;
      classNext[id*2+1]=next1;
    }else{
      assert.equal(classOutput[id*2],output0);
      assert.equal(classOutput[id*2+1],output1);
      assert.equal(classNext[id*2],next0);
      assert.equal(classNext[id*2+1],next1);
    }
  }
  const rootSeen=new Uint8Array(classCount);
  for(let model=0;model<MODEL_COUNT;model++)rootSeen[classes[3*model]]=1;
  /** @type {number[]} */
  const root=[];
  for(let id=0;id<classCount;id++)if(rootSeen[id])root.push(id);
  return {count:classCount,classes,output:classOutput,next:classNext,root};
}

/**
 * Exact finite-horizon minimax search over sorted behaviour-class sets.
 *
 * Win(B,k) is true iff B is terminal, or there is an input for which every
 * nonempty output child is Win(child,k-1). The attacker chooses the input;
 * the unknown source chooses the observed output. A binary-string key of the
 * sorted Uint16Array is collision-free, unlike a probabilistic hash.
 * @returns {MinimaxResult}
 */
function computeThreeStateMinimax(){
  const corpus=enumerateThreeStateModels();
  const quotient=refineBehaviorClasses(corpus);
  const {count,classOutput,classNext,root:rootIds}=quotient;
  const marks=new Uint32Array(count);
  let stamp=0;

  /**
   * @param {Uint16Array} belief
   * @param {number} input
   * @param {number} observed
   * @returns {Uint16Array}
   */
  function successor(belief,input,observed){
    stamp++;
    /** @type {number[]} */
    const values=[];
    for(let i=0;i<belief.length;i++){
      const id=belief[i];
      if(classOutput[id*2+input]===observed){
        const target=classNext[id*2+input];
        if(marks[target]!==stamp){
          marks[target]=stamp;
          values.push(target);
        }
      }
    }
    values.sort((a,b)=>a-b);
    return Uint16Array.from(values);
  }

  /** @param {Uint16Array} belief @returns {string} */
  function encodeBelief(belief){
    return Buffer.from(belief.buffer,belief.byteOffset,belief.byteLength)
      .toString('base64');
  }

  const maxBudget=24;
  /** @type {Map<string,number>[]} */
  const memo=Array.from({length:maxBudget+1},()=>new Map());
  let visited=0;
  let cacheHits=0;

  /**
   * @param {Uint16Array} belief
   * @param {number} budget
   * @returns {boolean}
   */
  function canWin(belief,budget){
    if(belief.length===1)return true;
    if(budget===0)return false;
    const key=encodeBelief(belief);
    const cached=memo[budget].get(key);
    if(cached!==undefined){
      cacheHits++;
      return cached>=0;
    }
    visited++;
    for(let input=0;input<2;input++){
      const zero=successor(belief,input,0);
      const one=successor(belief,input,1);
      if(zero.length&&!canWin(zero,budget-1))continue;
      if(one.length&&!canWin(one,budget-1))continue;
      memo[budget].set(key,input);
      return true;
    }
    memo[budget].set(key,-1);
    return false;
  }

  const root=Uint16Array.from(rootIds);
  const lowerStart=Date.now();
  const canWin23=canWin(root,23);
  const statesAfterBudget23={visited,cacheHits};
  const upperStart=Date.now();
  const canWin24=canWin(root,24);
  const statesAfterBudget24={visited,cacheHits};
  assert.equal(canWin23,false);
  assert.equal(canWin24,true);

  // Materialize and verify the winning policy DAG, not merely its root bit.
  /** @type {Set<string>} */
  const policySeen=new Set();
  let policyNodes=0;
  let terminalLeaves=0;
  let maxQueries=0;
  /**
   * @param {Uint16Array} belief
   * @param {number} budget
   * @param {number} depth
   * @returns {void}
   */
  function verifyPolicy(belief,budget,depth){
    if(belief.length===1){
      terminalLeaves++;
      maxQueries=Math.max(maxQueries,depth);
      return;
    }
    const key=encodeBelief(belief);
    const input=memo[budget].get(key);
    assert.ok(input===0||input===1);
    const stateKey=budget+':'+key;
    if(policySeen.has(stateKey))return;
    policySeen.add(stateKey);
    policyNodes++;
    for(let observed=0;observed<2;observed++){
      const child=successor(belief,input,observed);
      if(child.length){
        assert.equal(canWin(child,budget-1),true);
        verifyPolicy(child,budget-1,depth+1);
      }
    }
  }
  verifyPolicy(root,24,0);
  const totalMemoEntries=memo.reduce((total,entries)=>total+entries.size,0);
  // Keep timing out of the result: CI speed is runner-dependent.
  void lowerStart;
  void upperStart;
  return {
    modelCount:MODEL_COUNT,
    behaviorClasses:count,
    initialClasses:root.length,
    minimaxQueries:24,
    noStrategyWithin23:!canWin23,
    strategyWithin24:canWin24,
    statesAfterBudget23,
    statesAfterBudget24,
    policyNodes,
    terminalLeaves,
    maxQueries,
    totalMemoEntries
  };
}

if(require.main===module){
  console.log(JSON.stringify(computeThreeStateMinimax(),null,2));
}

module.exports={computeThreeStateMinimax};
