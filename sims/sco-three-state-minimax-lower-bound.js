'use strict';

const assert=require('node:assert/strict');

const MODEL_COUNT=46656;
const WORD_BITS=32;

/**
 * @typedef {{next:Uint8Array[][],output:Uint8Array[][]}} ThreeStateCorpus
 * @typedef {{classes:Uint16Array,classCount:number,classOutput:Uint8Array,
 *   classNext:Uint16Array}} BehaviorQuotient
 * @typedef {{
 *   modelCount:number,behaviorClassCount:number,initialClassCount:number,
 *   beliefNodesByDepth:number[],survivalCounts:number[],
 *   rootSurvivesNineQueries:boolean,worstCaseLowerBound:number,
 *   adversarialInputSequences:number,minimumFinalBehaviorClasses:number,
 *   maximumFinalBehaviorClasses:number,
 *   zeroInputTranscript:{inputs:number[],outputs:number[],survivingModels:number,
 *     survivingBehaviorClasses:number,firstSurvivingModel:number}
 * }} LowerBoundResult
 */

/**
 * Enumerate every labelled three-state binary-input/binary-output Mealy
 * machine. The initial state is state zero and there is no reset operation.
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
 * Compute the exact right-congruence quotient of all 139,968 rooted machine
 * states by deterministic partition refinement. Equal classes have equal
 * outputs and transition to equal classes for both inputs.
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
      // Four disjoint bit fields: output0, nextClass0, output1, nextClass1.
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
  return {classes,classCount,classOutput,classNext};
}

/** @param {Uint32Array} words @returns {string} */
function hashBelief(words){
  let first=0x811c9dc5,second=0x9e3779b9;
  for(let i=0;i<words.length;i++){
    const value=words[i]>>>0;
    first=Math.imul(first^value,0x01000193);
    second=Math.imul(second^value,0x85ebca6b);
    second^=second>>>13;
  }
  return (first>>>0).toString(16)+':'+(second>>>0).toString(16);
}

/**
 * @param {Uint32Array} left
 * @param {Uint32Array} right
 * @returns {boolean}
 */
function equalBeliefs(left,right){
  for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;
  return true;
}

/** @param {Uint32Array} words @returns {boolean} */
function isSingletonBelief(words){
  let found=false;
  for(let i=0;i<words.length;i++){
    const value=words[i]>>>0;
    if(value!==0){
      if(found||(value&(value-1))!==0)return false;
      found=true;
    }
  }
  return found;
}

/** @param {Uint32Array} words @returns {number} */
function countBeliefClasses(words){
  let count=0;
  for(let i=0;i<words.length;i++){
    let value=words[i]>>>0;
    while(value!==0){
      value&=value-1;
      count++;
    }
  }
  return count;
}

/**
 * Build the reachable adaptive no-reset belief graph through depth nine.
 *
 * A belief is a set of current behavior classes, not labelled source tables.
 * This quotient is exact because refinement established that each class has
 * a unique output and successor class for each input. The adversary's
 * survival recurrence is S(0,B)=non-singleton(B), and
 * S(k+1,B)=non-singleton(B) AND for every input some nonempty output child
 * satisfies S(k,child). If S(9,root) is true, every attacker strategy has a
 * consistent three-state source that remains behaviorally ambiguous after
 * nine requests. This proves a lower bound of ten, not an exact upper bound.
 * @returns {LowerBoundResult}
 */
function computeThreeStateLowerBound(){
  const corpus=enumerateThreeStateModels();
  const quotient=refineBehaviorClasses(corpus);
  const {classes,classCount,classOutput,classNext}=quotient;
  const wordCount=Math.ceil(classCount/WORD_BITS);
  const root=new Uint32Array(wordCount);
  for(let model=0;model<MODEL_COUNT;model++){
    const id=classes[3*model];
    root[id>>>5]|=(1<<(id&31));
  }

  /**
   * @param {Uint32Array} words
   * @param {number} input
   * @param {number} observed
   * @returns {Uint32Array|null}
   */
  function successor(words,input,observed){
    const child=new Uint32Array(wordCount);
    let any=false;
    for(let word=0;word<wordCount;word++){
      let bits=words[word]>>>0;
      while(bits!==0){
        const low=bits&-bits;
        const position=31-Math.clz32(low);
        const id=(word<<5)+position;
        if(classOutput[id*2+input]===observed){
          const target=classNext[id*2+input];
          child[target>>>5]|=(1<<(target&31));
          any=true;
        }
        bits&=bits-1;
      }
    }
    return any?child:null;
  }

  /** @type {Uint32Array[]} */
  const beliefs=[root];
  /** @type {number[]} */
  const depths=[0];
  /** @type {Int32Array[]} */
  const transitions=[];
  /** @type {Map<string,number[]>} */
  const indices=new Map([[hashBelief(root),[0]]]);
  /**
   * @param {Uint32Array} words
   * @param {number} depth
   * @returns {number}
   */
  function addBelief(words,depth){
    const hash=hashBelief(words);
    const bucket=indices.get(hash);
    if(bucket){
      for(const id of bucket)if(equalBeliefs(beliefs[id],words))return id;
    }
    const id=beliefs.length;
    beliefs.push(words);
    depths.push(depth);
    if(bucket)bucket.push(id);
    else indices.set(hash,[id]);
    return id;
  }

  // Breadth-first order ensures all nodes through depth eight are expanded;
  // depth-nine nodes are the base layer for the nine-query survival proof.
  for(let at=0;at<beliefs.length;at++){
    const depth=depths[at];
    if(depth===9)break;
    const edges=new Int32Array(4);
    edges.fill(-1);
    if(!isSingletonBelief(beliefs[at])){
      for(let input=0;input<2;input++)for(let observed=0;observed<2;observed++){
        const child=successor(beliefs[at],input,observed);
        if(child)edges[input*2+observed]=addBelief(child,depth+1);
      }
    }
    transitions.push(edges);
  }

  const nodesByDepth=Array(10).fill(0);
  for(const depth of depths)nodesByDepth[depth]++;
  assert.deepEqual(nodesByDepth,[1,4,16,64,248,956,3632,13216,45656,135212]);
  assert.equal(beliefs.length,199005);
  assert.equal(transitions.length,63793);

  /** @type {Uint8Array[]} */
  const survivalLayers=[];
  const base=new Uint8Array(beliefs.length);
  for(let i=0;i<beliefs.length;i++){
    base[i]=isSingletonBelief(beliefs[i])?0:1;
  }
  survivalLayers.push(base);
  /** @type {number[]} */
  const survivalCounts=[];
  for(let remaining=1;remaining<=9;remaining++){
    const previous=survivalLayers[remaining-1];
    const current=new Uint8Array(beliefs.length);
    const maxDepth=9-remaining;
    for(let i=0;i<transitions.length;i++){
      if(depths[i]>maxDepth||!previous[i])continue;
      const edges=transitions[i];
      let canSurvive=true;
      for(let input=0;input<2;input++){
        const zero=edges[input*2],one=edges[input*2+1];
        if(!((zero>=0&&previous[zero])||(one>=0&&previous[one]))){
          canSurvive=false;
          break;
        }
      }
      current[i]=canSurvive?1:0;
    }
    survivalLayers.push(current);
    let count=0;
    for(const value of current)count+=value;
    survivalCounts.push(count);
  }
  assert.equal(survivalLayers[9][0],1);

  // Enumerate every one of the 2^9 fixed input sequences. The response policy
  // always chooses a child that preserves the remaining survival certificate.
  /** @type {number[]} */
  const finalClassCounts=[];
  for(let sequence=0;sequence<512;sequence++){
    let node=0,remaining=9;
    for(let step=0;step<9;step++){
      const input=(sequence>>>step)&1;
      const edges=transitions[node];
      let child=edges[input*2];
      if(!(child>=0&&survivalLayers[remaining-1][child])){
        child=edges[input*2+1];
      }
      assert.ok(child>=0&&survivalLayers[remaining-1][child]);
      node=child;
      remaining--;
    }
    const count=countBeliefClasses(beliefs[node]);
    assert.ok(count>1);
    finalClassCounts.push(count);
  }

  // One concrete adversarial path, replayed against the original labelled
  // source tables to show that the quotient transcript has real witnesses.
  const zeroInputs=Array(9).fill(0);
  let zeroNode=0;
  /** @type {number[]} */
  const zeroOutputs=[];
  for(let step=0;step<9;step++){
    const edges=transitions[zeroNode];
    let observed=0,child=edges[0];
    if(!(child>=0&&survivalLayers[8-step][child])){
      observed=1;
      child=edges[1];
    }
    assert.ok(child>=0&&survivalLayers[8-step][child]);
    zeroOutputs.push(observed);
    zeroNode=child;
  }
  let survivingModels=0,firstSurvivingModel=-1;
  for(let model=0;model<MODEL_COUNT;model++){
    let state=0,matches=true;
    for(let step=0;step<9;step++){
      if(corpus.output[state][0][model]!==zeroOutputs[step]){
        matches=false;
        break;
      }
      state=corpus.next[state][0][model];
    }
    if(matches){
      survivingModels++;
      if(firstSurvivingModel<0)firstSurvivingModel=model;
    }
  }

  return {
    modelCount:MODEL_COUNT,
    behaviorClassCount:classCount,
    initialClassCount:countBeliefClasses(root),
    beliefNodesByDepth:nodesByDepth,
    survivalCounts,
    rootSurvivesNineQueries:true,
    worstCaseLowerBound:10,
    adversarialInputSequences:512,
    minimumFinalBehaviorClasses:Math.min(...finalClassCounts),
    maximumFinalBehaviorClasses:Math.max(...finalClassCounts),
    zeroInputTranscript:{
      inputs:zeroInputs,
      outputs:zeroOutputs,
      survivingModels,
      survivingBehaviorClasses:countBeliefClasses(beliefs[zeroNode]),
      firstSurvivingModel
    }
  };
}

if(require.main===module){
  console.log(JSON.stringify(computeThreeStateLowerBound(),null,2));
}

module.exports={computeThreeStateLowerBound};
