'use strict';

const {enumerateMachines,chooseSymbol,distinguish}=require('./sco-step-only-version-space');

/** @typedef {{next:number[][],output:number[][],state:number}} Candidate */
/** @typedef {{model:Candidate,state:number}} Rooted */

/**
 * All nonempty binary words through the product-state distinguishing bound
 * for two machines with at most two states (2*2 = 4).
 * @returns {number[][]}
 */
function observationWords(){
  /** @type {number[][]} */
  const words=[];
  for(let length=1;length<=4;length++){
    for(let mask=0;mask<1<<length;mask++){
      words.push(Array.from({length},(_,index)=>(mask>>index)&1));
    }
  }
  return words;
}

const WORDS=observationWords();

/**
 * Finite complete behavioral signature: any inequivalent pair of machines
 * with <=2 states has a first mismatch on a word of length <=4.
 * @param {Candidate} model
 * @param {number} root
 * @returns {string}
 */
function signature(model,root){
  return WORDS.map(word=>{
    let current=root;
    let result='';
    for(const symbol of word){
      result+=model.output[current][symbol];
      current=model.next[current][symbol];
    }
    return result;
  }).join('|');
}

/**
 * Create the full state-minimal observable automaton of all rooted binary
 * Mealy machines having at most two states. Distinct labels and unreachable
 * padding are merged only when their future output functions are identical.
 *
 * @returns {{models:Candidate[],rooted:Rooted[],types:number[],
 *   outputs:number[][],successors:number[][],rootTypes:number[]}}
 */
function buildBehaviorTypes(){
  const models=enumerateMachines(2);
  /** @type {Rooted[]} */
  const rooted=[];
  for(const model of models){
    for(let state=0;state<model.next.length;state++)rooted.push({model,state});
  }
  /** @type {Map<string,number>} */
  const indices=new Map();
  /** @type {Rooted[]} */
  const representatives=[];
  /** @type {number[]} */
  const types=[];
  for(const entry of rooted){
    const key=signature(entry.model,entry.state);
    let index=indices.get(key);
    if(index===undefined){
      index=representatives.length;
      indices.set(key,index);
      representatives.push(entry);
    }
    types.push(index);
  }
  const outputs=representatives.map(entry=>entry.model.output[entry.state].slice());
  const successors=representatives.map(entry=>[0,1].map(symbol=>{
    const target=entry.model.next[entry.state][symbol];
    const index=indices.get(signature(entry.model,target));
    if(index===undefined)throw new Error('Missing transition behavioral type');
    return index;
  }));
  const rootTypes=models.map(model=>{
    const index=indices.get(signature(model,0));
    if(index===undefined)throw new Error('Missing initial behavioral type');
    return index;
  });
  return {models,rooted,types,outputs,successors,rootTypes};
}

/**
 * Return nonempty observed-output successor beliefs for an input symbol.
 * The BigInt set carries one bit for each *behaviorally distinct* root type.
 * @param {bigint} belief
 * @param {number} input
 * @param {number[][]} outputs
 * @param {number[][]} successors
 * @returns {bigint[]}
 */
function advance(belief,input,outputs,successors){
  const next=[0n,0n];
  let remaining=belief;
  while(remaining!==0n){
    const low=remaining&-remaining;
    let type=0;
    let cursor=low;
    while(cursor>1n){cursor>>=1n;type++;}
    const output=outputs[type][input];
    next[output]|=1n<<BigInt(successors[type][input]);
    remaining^=low;
  }
  return next.filter(value=>value!==0n);
}

/**
 * Exhaustive minimax dynamic program for the entire rooted <=2-state binary
 * Mealy class. The attacker chooses inputs; an unknown fixed machine supplies
 * outputs. The objective is a *current-state continuation clone*, and a
 * singleton behavioral type is the terminal certificate. Each possible output
 * branch is nonempty precisely when some initially admissible fixed machine
 * can realize that branch along the observed transcript.
 *
 * @returns {{sourceModels:number,rootedVariants:number,behaviorTypes:number,
 *   reachableBeliefs:number,winningBeliefs:number,minimaxQueries:number,
 *   layerSizes:number[],heuristicWorstCase:number,heuristicHistogram:number[]}}
 */
function analyzeTwoStateMinimax(){
  const {models,rooted,outputs,successors,rootTypes}=buildBehaviorTypes();
  const full=rootTypes.reduce((bits,index)=>bits|(1n<<BigInt(index)),0n);
  /** @type {Map<bigint,bigint[][]>} */
  const transitions=new Map();
  const seen=new Set([full]);
  const queue=[full];
  for(let head=0;head<queue.length;head++){
    const belief=queue[head];
    if((belief&(belief-1n))===0n)continue;
    const choices=[advance(belief,0,outputs,successors),
      advance(belief,1,outputs,successors)];
    transitions.set(belief,choices);
    for(const choice of choices)for(const followup of choice){
      if(!seen.has(followup)){
        seen.add(followup);
        queue.push(followup);
      }
    }
  }
  /** @type {Map<bigint,number>} */
  const rank=new Map();
  for(const belief of queue)if((belief&(belief-1n))===0n)rank.set(belief,0);
  /** @type {number[]} */
  const layerSizes=[];
  for(let depth=1;depth<=queue.length;depth++){
    /** @type {bigint[]} */
    const layer=[];
    for(const belief of queue){
      if(rank.has(belief))continue;
      const choices=transitions.get(belief);
      if(!choices)throw new Error('Nonterminal belief has no transitions');
      if(choices.some(branch=>branch.every(child=>rank.has(child))))layer.push(belief);
    }
    if(layer.length===0)break;
    for(const belief of layer)rank.set(belief,depth);
    layerSizes.push(layer.length);
  }
  if(rank.size!==queue.length)throw new Error('An initial belief is not finitely identifiable');
  const minimaxQueries=rank.get(full);
  if(minimaxQueries===undefined)throw new Error('Missing initial minimax rank');

  /** @type {number[]} */
  const histogram=[];
  for(const model of models){
    const hypotheses=enumerateMachines(2);
    let current=0;
    let queries=0;
    for(;queries<=20;queries++){
      const choice=chooseSymbol(hypotheses);
      if(choice.certified)break;
      if(choice.symbol===null)throw new Error('Uncertified hypothesis without input');
      const symbol=choice.symbol;
      const answer=model.output[current][symbol];
      current=model.next[current][symbol];
      for(let index=hypotheses.length-1;index>=0;index--){
        const candidate=hypotheses[index];
        if(candidate.output[candidate.state][symbol]!==answer){
          hypotheses.splice(index,1);
        }else candidate.state=candidate.next[candidate.state][symbol];
      }
      if(hypotheses.length===0)throw new Error('Inconsistent true machine');
    }
    if(queries>20)throw new Error('Heuristic did not certify within 20 steps');
    histogram[queries]=(histogram[queries]||0)+1;
  }
  return {sourceModels:models.length,rootedVariants:rooted.length,
    behaviorTypes:outputs.length,reachableBeliefs:seen.size,
    winningBeliefs:rank.size,minimaxQueries,layerSizes,
    heuristicWorstCase:histogram.length-1,
    heuristicHistogram:Array.from({length:histogram.length},(_,index)=>histogram[index]||0)};
}

if(require.main===module)console.log(JSON.stringify(analyzeTwoStateMinimax()));
module.exports={observationWords,signature,buildBehaviorTypes,advance,analyzeTwoStateMinimax};
