'use strict';

/**
 * Complete, independent, bounded no-reset binary Mealy learner. All of the
 * 260 labelled one-/two-state tables are public hypotheses, not original
 * source obtained from a private service. A belief retains the live current
 * state of each surviving table. We solve the finite adversarial policy game
 * by simultaneous Bellman layers, not an optimistic in-place relaxation.
 *
 * @typedef {{next:number[][],output:number[][]}} Machine
 * @typedef {{models:Machine[], beliefs:number[][], transitions:number[][][],
 *   ranks:number[], decisions:number[],root:number}} Policy
 */

/** @returns {Machine[]} */
function enumerateModels(){
  /** @type {Machine[]} */
  const models=[];
  for(let states=1;states<=2;states++){
    const choices=2*states;
    for(let id=0;id<choices**(2*states);id++){
      let rest=id;
      /** @type {number[][]} */
      const next=[];
      /** @type {number[][]} */
      const output=[];
      for(let state=0;state<states;state++){
        /** @type {number[]} */
        const nextRow=[],outputRow=[];
        for(let input=0;input<2;input++){
          const option=rest%choices;
          rest=Math.floor(rest/choices);
          nextRow.push(Math.floor(option/2));
          outputRow.push(option%2);
        }
        next.push(nextRow);
        output.push(outputRow);
      }
      models.push({next,output});
    }
  }
  return models;
}

/**
 * Each encoded entry is 2*modelIndex+currentState. Models with one state
 * never use the second state label. Every belief has at most one live state
 * for each table because the transcript starts from a known state zero.
 * @param {Machine[]} models
 * @param {number[]} belief
 * @param {0|1} input
 * @param {0|1} observed
 * @returns {number[]}
 */
function successor(models,belief,input,observed){
  /** @type {number[]} */
  const answer=[];
  for(const encoded of belief){
    const index=Math.floor(encoded/2),state=encoded%2;
    const model=models[index];
    if(model.output[state][input]===observed){
      answer.push(2*index+model.next[state][input]);
    }
  }
  return answer;
}

/**
 * Exact future-output equivalence of two rooted finite machines, checked
 * on the finite product graph. Matching only the current outputs is not
 * sufficient: all future continuation words must agree.
 * @param {Machine[]} models
 * @param {number} left
 * @param {number} right
 * @returns {boolean}
 */
function equivalent(models,left,right){
  const leftIndex=Math.floor(left/2),rightIndex=Math.floor(right/2);
  const a=models[leftIndex],b=models[rightIndex];
  /** @type {Array<[number,number]>} */
  const queue=[[left%2,right%2]];
  const visited=new Set();
  for(let at=0;at<queue.length;at++){
    const [sa,sb]=queue[at];
    const key=sa*2+sb;
    if(visited.has(key))continue;
    visited.add(key);
    for(let input=0;input<2;input++){
      if(a.output[sa][input]!==b.output[sb][input])return false;
      queue.push([a.next[sa][input],b.next[sb][input]]);
    }
  }
  return true;
}

/**
 * Construct reachable beliefs and calculate the exact worst-case minimum
 * remaining number of oracle calls. This returns a data-independent policy,
 * so the attacker requires no access to the private transition table.
 *
 * @returns {Policy}
 */
function createPolicy(){
  const models=enumerateModels();
  const root=Array.from({length:models.length},(_,index)=>2*index);
  /** @type {number[][]} */
  const beliefs=[root];
  const indices=new Map([[root.join(','),0]]);
  /** @type {number[][][]} */
  const transitions=[];
  for(let at=0;at<beliefs.length;at++){
    /** @type {number[][]} */
    const edges=[];
    for(const input of /** @type {const} */([0,1])){
      /** @type {number[]} */
      const children=[];
      for(const observed of /** @type {const} */([0,1])){
        const next=successor(models,beliefs[at],input,observed);
        if(!next.length){children.push(-1);continue;}
        const key=next.join(',');
        let id=indices.get(key);
        if(id===undefined){
          id=beliefs.length;
          indices.set(key,id);
          beliefs.push(next);
        }
        children.push(id);
      }
      edges.push(children);
    }
    transitions.push(edges);
  }
  /** @type {number[]} */
  const ranks=beliefs.map(belief=>
    belief.every(encoded=>equivalent(models,belief[0],encoded))?0:-1);
  for(let layer=1;layer<=beliefs.length;layer++){
    const previous=[...ranks];
    let changed=0;
    for(let i=0;i<beliefs.length;i++){
      if(previous[i]!==-1)continue;
      if(transitions[i].some(edges=>edges.every(child=>child<0||
        previous[child]>=0))){
        ranks[i]=layer;
        changed++;
      }
    }
    if(!changed)break;
  }
  if(ranks.some(rank=>rank<0)){
    throw new Error('Uncertified reachable belief in the two-state model');
  }
  const decisions=transitions.map((edges,index)=>{
    if(ranks[index]===0)return -1;
    for(let input=0;input<2;input++){
      if(edges[input].every(child=>child<0||ranks[child]<ranks[index])){
        return input;
      }
    }
    throw new Error('No rank-decreasing policy at belief '+index);
  });
  return {models,beliefs,transitions,ranks,decisions,root:0};
}

/**
 * @typedef {{step:(input:number)=>Promise<number>}} StepOracle
 * @typedef {{queries:number,inputs:number[],outputs:number[],
 *   clone:Machine,currentState:number,remaining:number,initialRank:number,
 *   rankTrace:number[],beliefCount:number,modelCount:number}} Learned
 */

/**
 * Learn from a single evolving (non-resettable) public session.
 * No private model, random seed, or debug callback is accepted as input.
 * @param {StepOracle} oracle
 * @param {Policy} policy
 * @returns {Promise<Learned>}
 */
async function learn(oracle,policy){
  const initialRank=policy.ranks[policy.root];
  let at=policy.root;
  /** @type {number[]} */
  const inputs=[],outputs=[],rankTrace=[initialRank];
  while(policy.ranks[at]>0){
    const input=policy.decisions[at];
    if(input!==0&&input!==1)throw new Error('Invalid binary decision');
    const answer=await oracle.step(input);
    if(answer!==0&&answer!==1)throw new Error('Unexpected oracle output');
    const next=policy.transitions[at][input][answer];
    if(next<0||policy.ranks[next]>=policy.ranks[at]){
      throw new Error('Oracle violated trusted two-state hypothesis');
    }
    inputs.push(input);outputs.push(answer);at=next;
    rankTrace.push(policy.ranks[at]);
  }
  const [first]=policy.beliefs[at];
  const model=policy.models[Math.floor(first/2)];
  return {queries:inputs.length,inputs,outputs,clone:model,
    currentState:first%2,remaining:policy.beliefs[at].length,
    initialRank,rankTrace,beliefCount:policy.beliefs.length,
    modelCount:policy.models.length};
}

/**
 * @param {Machine} model
 * @param {number} state
 * @param {number[]} inputs
 * @returns {{outputs:number[],state:number}}
 */
function continuation(model,state,inputs){
  /** @type {number[]} */
  const outputs=[];
  for(const input of inputs){
    if(input!==0&&input!==1)throw new RangeError('Binary input required');
    outputs.push(model.output[state][input]);
    state=model.next[state][input];
  }
  return {outputs,state};
}

module.exports={enumerateModels,successor,equivalent,createPolicy,learn,continuation};
