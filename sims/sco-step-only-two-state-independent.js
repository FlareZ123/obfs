'use strict';

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @typedef {{states:Uint8Array,mass:number,terminal:boolean,children:[(string|null)[],(string|null)[]]}} Belief */

/** Fully independent mixed-radix enumeration of labelled 1- and 2-state machines. @returns {Machine[]} */
function sourceTables(){
  /** @type {Machine[]} */
  const models=[];
  for(let states=1;states<=2;states++){
    const radix=2*states;
    for(let code=0;code<radix**(2*states);code++){
      let remainder=code;
      const next=Array.from({length:states},()=>[0,0]);
      const output=Array.from({length:states},()=>[0,0]);
      for(let position=0;position<2*states;position++){
        const digit=remainder%radix;
        remainder=Math.floor(remainder/radix);
        const state=Math.floor(position/2),symbol=position%2;
        output[state][symbol]=digit%2;
        next[state][symbol]=Math.floor(digit/2);
      }
      models.push({next,output});
    }
  }
  return models;
}

/**
 * Independent product-pair exploration, no fixed word signature.
 * @param {Machine} left
 * @param {number} leftState
 * @param {Machine} right
 * @param {number} rightState
 * @returns {boolean}
 */
function sameContinuation(left,leftState,right,rightState){
  const width=right.next.length;
  const queue=[[leftState,rightState]];
  const seen=new Set([leftState*width+rightState]);
  for(let index=0;index<queue.length;index++){
    const [a,b]=queue[index];
    for(let input=0;input<2;input++){
      if(left.output[a][input]!==right.output[b][input])return false;
      const aNext=left.next[a][input],bNext=right.next[b][input];
      const pair=aNext*width+bNext;
      if(!seen.has(pair)){
        seen.add(pair);
        queue.push([aNext,bNext]);
      }
    }
  }
  return true;
}

/** @param {Machine[]} models */
function rootedEquivalence(models){
  /** @type {number[]} */
  const offsets=[];
  let rooted=0;
  for(const model of models){offsets.push(rooted);rooted+=model.next.length;}
  const pairs=new Uint8Array(rooted*rooted);
  for(let i=0;i<models.length;i++)for(let state=0;state<models[i].next.length;state++){
    const a=offsets[i]+state;
    for(let j=0;j<=i;j++)for(let other=0;other<models[j].next.length;other++){
      const b=offsets[j]+other;
      if(b>a)continue;
      const equivalent=sameContinuation(models[i],state,models[j],other);
      pairs[a*rooted+b]=equivalent?1:0;
      pairs[b*rooted+a]=equivalent?1:0;
    }
  }
  return {pairs,offsets,rooted};
}

/**
 * Independently preserve one current state for *every original source table*,
 * rather than compressing models into future-behavior types or posterior counts.
 * The all-255 code marks an impossible output branch, never a valid belief.
 * @returns {{models:Machine[],beliefs:Map<string,Belief>,initialKey:string,
 *   statesVisited:number,rootedVariants:number}}
 */
function buildExplicitBeliefs(){
  const models=sourceTables();
  const {pairs,offsets,rooted}=rootedEquivalence(models);
  /** @param {Uint8Array} stateVector */
  function description(stateVector){
    let mass=0,reference=-1,terminal=true;
    for(let i=0;i<stateVector.length;i++){
      const state=stateVector[i];
      if(state===255)continue;
      mass++;
      const index=offsets[i]+state;
      if(reference<0)reference=index;
      else if(pairs[reference*rooted+index]!==1)terminal=false;
    }
    if(mass===0)throw new Error('Empty belief cannot be registered');
    return {mass,terminal};
  }
  /** @type {Map<string,Belief>} */
  const beliefs=new Map();
  /** @type {string[]} */
  const pending=[];
  /** @param {Uint8Array} vector */
  function register(vector){
    const key=Buffer.from(vector).toString('base64');
    if(!beliefs.has(key)){
      const {mass,terminal}=description(vector);
      beliefs.set(key,{states:vector,mass,terminal,children:[[null,null],[null,null]]});
      pending.push(key);
    }
    return key;
  }
  const initialKey=register(new Uint8Array(models.length));
  for(let head=0;head<pending.length;head++){
    const key=pending[head],belief=beliefs.get(key);
    if(!belief)throw new Error('Untracked belief');
    if(belief.terminal)continue;
    for(let symbol=0;symbol<2;symbol++){
      for(let answer=0;answer<2;answer++){
        const vector=new Uint8Array(models.length);
        vector.fill(255);
        let mass=0;
        for(let i=0;i<models.length;i++){
          const state=belief.states[i];
          if(state===255||models[i].output[state][symbol]!==answer)continue;
          vector[i]=models[i].next[state][symbol];
          mass++;
        }
        if(mass!==0)belief.children[symbol][answer]=register(vector);
      }
    }
  }
  return {models,beliefs,initialKey,statesVisited:pending.length,rootedVariants:rooted};
}

/**
 * Return exact minimax and uniform-labelled-model aggregate costs by dynamic
 * programming on the *explicit*, uncompressed labelled-model belief graph.
 * @returns {{sourceModels:number,rootedVariants:number,explicitBeliefs:number,
 *   maxQueryDepth:number,weightedPolicyTotal:number,expectedPolicyTotal:number,
 *   weightedPolicyUnboundedDepth:number,allBeliefsCertified:boolean}}
 */
function analyzeIndependentTwoState(){
  const {models,beliefs,initialKey,statesVisited,rootedVariants}=buildExplicitBeliefs();
  /** @type {Map<string,number>} */
  let minimax=new Map(),weighted=new Map();
  for(const [id,node] of beliefs){
    minimax.set(id,node.terminal?0:Infinity);
    weighted.set(id,node.terminal?0:Infinity);
  }
  let maxQueryDepth=0,weightedPolicyUnboundedDepth=0,expectedPolicyTotal=Infinity,allBeliefsCertified=false;
  /** @type {Map<string,number>} */
  let nineCosts=new Map();
  for(let depth=1;depth<=statesVisited;depth++){
    /** @type {Map<string,number>} */
    const nextMinimax=new Map(),nextWeighted=new Map();
    let newMinimax=0,newWeighted=0;
    for(const [id,node] of beliefs){
      if(node.terminal){nextMinimax.set(id,0);nextWeighted.set(id,0);continue;}
      let worst=Infinity,bestWeighted=Infinity;
      for(let symbol=0;symbol<2;symbol++){
        const branch=node.children[symbol];
        let maximum=0,aggregate=node.mass;
        for(const child of branch){
          if(child===null)continue;
          maximum=Math.max(maximum,minimax.get(child)??Infinity);
          aggregate+=weighted.get(child)??Infinity;
        }
        worst=Math.min(worst,1+maximum);
        bestWeighted=Math.min(bestWeighted,aggregate);
      }
      nextMinimax.set(id,worst);
      nextWeighted.set(id,bestWeighted);
      if(worst!==minimax.get(id))newMinimax++;
      if(bestWeighted!==weighted.get(id))newWeighted++;
    }
    minimax=nextMinimax;
    weighted=nextWeighted;
    if(depth===9)nineCosts=new Map(weighted);
    if(maxQueryDepth===0&&Number.isFinite(minimax.get(initialKey)))maxQueryDepth=depth;
    if(newWeighted===0){weightedPolicyUnboundedDepth=depth;expectedPolicyTotal=weighted.get(initialKey)??Infinity;}
    if(newMinimax===0&&newWeighted===0){
      allBeliefsCertified=Array.from(minimax.values()).every(Number.isFinite);
      break;
    }
  }
  return {sourceModels:models.length,rootedVariants,explicitBeliefs:statesVisited,
    maxQueryDepth,weightedPolicyTotal:nineCosts.get(initialKey)??Infinity,
    expectedPolicyTotal,weightedPolicyUnboundedDepth,allBeliefsCertified};
}

if(require.main===module)console.log(JSON.stringify(analyzeIndependentTwoState()));
module.exports={sourceTables,sameContinuation,rootedEquivalence,buildExplicitBeliefs,analyzeIndependentTwoState};
