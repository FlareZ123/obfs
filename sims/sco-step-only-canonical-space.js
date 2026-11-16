'use strict';

const {learnWithCandidates}=require('./sco-step-only-version-space');

/** @typedef {{next:number[][],output:number[][],state:number}} Candidate */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */

/**
 * Enumerate canonical binary Mealy machines with every state reachable from
 * the initial state. Encountered state labels are assigned 0,1,2,... in BFS
 * order, visiting input symbol 0 before 1. Discarding unreachable states
 * preserves behavior for all accessible input words. Canonical relabeling
 * eliminates equivalent state-label permutations without losing any true
 * machine with <=maxStates states.
 *
 * @param {number} maxStates
 * @returns {Candidate[]}
 */
function enumerateCanonicalMachines(maxStates){
  if(!Number.isSafeInteger(maxStates)||maxStates<1||maxStates>3){
    throw new RangeError('maxStates must be 1..3');
  }
  /** @type {Candidate[]} */
  const models=[];
  for(let states=1;states<=maxStates;states++){
    const numberOfTransitions=2*states;
    for(let topology=0;topology<states**numberOfTransitions;topology++){
      let digits=topology;
      const next=Array.from({length:states},()=>[0,0]);
      for(let state=0;state<states;state++)for(let symbol=0;symbol<2;symbol++){
        next[state][symbol]=digits%states;
        digits=Math.floor(digits/states);
      }
      const queue=[0],known=new Set([0]);
      let valid=true;
      for(let cursor=0;cursor<queue.length&&valid;cursor++){
        const state=queue[cursor];
        for(let symbol=0;symbol<2;symbol++){
          const target=next[state][symbol];
          if(known.has(target))continue;
          if(target!==known.size){valid=false;break;}
          queue.push(target);
          known.add(target);
        }
      }
      if(!valid||queue.length!==states)continue;
      for(let bits=0;bits<2**numberOfTransitions;bits++){
        let mask=bits;
        const output=Array.from({length:states},()=>[0,0]);
        for(let state=0;state<states;state++)for(let symbol=0;symbol<2;symbol++){
          output[state][symbol]=mask%2;
          mask=Math.floor(mask/2);
        }
        models.push({next,output,state:0});
      }
    }
  }
  return models;
}

/**
 * Canonicalize any finite Mealy machine from its current state, dropping all
 * unreachable source states. Intended only for post-attack validation, not
 * public attacker inference.
 * @param {Candidate} machine
 * @returns {Candidate}
 */
function canonicalizeReachable(machine){
  const order=[machine.state];
  const labels=new Map([[machine.state,0]]);
  for(let cursor=0;cursor<order.length;cursor++){
    const state=order[cursor];
    for(const target of machine.next[state]){
      if(!labels.has(target)){
        labels.set(target,order.length);
        order.push(target);
      }
    }
  }
  return {
    next:order.map(state=>machine.next[state].map(target=>/** @type {number} */(labels.get(target)))),
    output:order.map(state=>[...machine.output[state]]),state:0
  };
}

/**
 * Public-only finite-state continuation learner using canonical reachable
 * models instead of all labeled models. The same exact version-space
 * filtering and pairwise product-equivalence certificate is used by both.
 * @param {StepOnlyOracle} api
 * @param {number} [maxStates]
 * @param {number} [maxQueries]
 * @returns {ReturnType<typeof learnWithCandidates>}
 */
function learnCanonicalStepOnly(api,maxStates=2,maxQueries=64){
  return learnWithCandidates(api,enumerateCanonicalMachines(maxStates),maxQueries);
}

module.exports={enumerateCanonicalMachines,canonicalizeReachable,learnCanonicalStepOnly};
