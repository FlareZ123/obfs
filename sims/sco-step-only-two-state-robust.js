'use strict';

const {buildExplicitBeliefs}=require('./sco-step-only-two-state-independent');
const {semanticSourceWeights}=require('./sco-step-only-two-state-prior-sensitivity');

/** @typedef {{source:number,semantic:number,symbol:0|1|null,branches:[Plan|null,Plan|null]}} Plan */
/** @typedef {{states:Uint8Array,mass:number,terminal:boolean,children:[(string|null)[],(string|null)[]]}} Belief */

/**
 * Preserve the exact cost pair and a concrete adaptive strategy. This is
 * a two-dimensional Pareto dynamic program under two simultaneous priors.
 * @param {Plan[]} plans
 * @returns {Plan[]}
 */
function nondominatedPlans(plans){
  /** @type {Map<number,Plan>} */
  const cheapest=new Map();
  for(const plan of plans){
    const old=cheapest.get(plan.source);
    if(old===undefined||plan.semantic<old.semantic)cheapest.set(plan.source,plan);
  }
  const sorted=[...cheapest.values()].sort((a,b)=>a.source-b.source);
  /** @type {Plan[]} */
  const answer=[];
  let lowest=Infinity;
  for(const plan of sorted){
    if(plan.semantic<lowest){
      answer.push(plan);
      lowest=plan.semantic;
    }
  }
  return answer;
}

/**
 * Build an offline policy using only the declared public model class.
 * The prior is ambiguous between uniform labelled source models and
 * uniform distinct initial future behaviors. The chosen policy minimizes
 * its worst proportional expected-cost regret across these two endpoints,
 * while respecting a ten-public-call worst-case limit.
 *
 * @returns {{graph:ReturnType<typeof buildExplicitBeliefs>,plan:Plan,
 *   frontier:{source:number,semantic:number}[],selectedSourceCost:number,
 *   selectedSemanticCost:number,maxProportionalRegret:number,
 *   maxPublicQueries:10,semanticScale:number}}
 */
function createTwoStateRobustWorkspace(){
  const graph=buildExplicitBeliefs();
  const {weights,scale}=semanticSourceWeights();
  const {beliefs,initialKey}=graph;
  /** @type {Map<string,number>} */
  const masses=new Map();
  for(const [key,belief] of beliefs){
    let total=0;
    for(let i=0;i<belief.states.length;i++){
      if(belief.states[i]!==255)total+=weights[i];
    }
    masses.set(key,total);
  }
  const empty=/** @type {Plan} */({source:0,semantic:0,symbol:null,branches:[null,null]});
  /** @type {Map<string,Plan[]>} */
  let preceding=new Map();
  for(const [key,belief] of beliefs)preceding.set(key,belief.terminal?[empty]:[]);
  const bound=10;
  for(let step=1;step<=bound;step++){
    /** @type {Map<string,Plan[]>} */
    const updated=new Map();
    for(const [key,belief] of beliefs){
      if(belief.terminal){updated.set(key,[empty]);continue;}
      /** @type {Plan[]} */
      const candidates=[];
      const semanticMass=masses.get(key);
      if(semanticMass===undefined)throw new Error('Unknown posterior mass');
      for(const symbol of /** @type {(0|1)[]} */([0,1])){
        const [key0,key1]=belief.children[symbol];
        const zero=key0===null?[null]:preceding.get(key0);
        const one=key1===null?[null]:preceding.get(key1);
        if(zero===undefined||one===undefined)throw new Error('Missing child cost frontier');
        for(const p0 of zero)for(const p1 of one){
          if(key0!==null&&p0===null || key1!==null&&p1===null)continue;
          candidates.push({
            source:belief.mass+(p0?.source||0)+(p1?.source||0),
            semantic:semanticMass+(p0?.semantic||0)+(p1?.semantic||0),
            symbol,branches:[p0,p1]
          });
        }
      }
      updated.set(key,nondominatedPlans(candidates));
    }
    preceding=updated;
  }
  const root=preceding.get(initialKey);
  if(!root||root.length===0)throw new Error('Unsolvable ten-step game');
  const minSource=Math.min(...root.map(plan=>plan.source));
  const minSemantic=Math.min(...root.map(plan=>plan.semantic));
  const regret=/** @param {Plan} p */(p)=>Math.max(
    (p.source-minSource)/minSource,
    (p.semantic-minSemantic)/minSemantic
  );
  const plan=root.reduce((best,option)=>
    regret(option)<regret(best)?option:best);
  return {graph,plan,
    frontier:root.map(({source,semantic})=>({source,semantic:semantic/scale})),
    selectedSourceCost:plan.source,selectedSemanticCost:plan.semantic/scale,
    maxProportionalRegret:regret(plan),maxPublicQueries:10,semanticScale:scale};
}

/**
 * Online public-only clone, using a precomputed exact ten-step adaptive
 * strategy. The only oracle capability is an async step(bit) operation.
 * The underlying stationary binary <=2-state bound must be correct.
 *
 * @param {{step:(symbol:number)=>Promise<number>}} api
 * @param {ReturnType<typeof createTwoStateRobustWorkspace>} [workspace]
 * @returns {Promise<{certified:true,queries:number,inputs:number[],
 *   outputs:number[],clone:{next:number[][],output:number[][],state:number},
 *   remaining:number,selectedSourceCost:number,selectedSemanticCost:number}>}
 */
async function learnTwoStateRobustStepOnly(api,workspace){
  const active=workspace||createTwoStateRobustWorkspace();
  let key=active.graph.initialKey;
  let plan=active.plan;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  while(true){
    const belief=active.graph.beliefs.get(key);
    if(!belief)throw new Error('Posterior belief missing');
    if(belief.terminal){
      const candidateIndex=belief.states.findIndex(state=>state!==255);
      if(candidateIndex<0)throw new Error('Certified without source hypothesis');
      const source=active.graph.models[candidateIndex];
      return {certified:true,queries:inputs.length,inputs,outputs,
        clone:{next:source.next.map(row=>row.slice()),output:source.output.map(row=>row.slice()),
          state:belief.states[candidateIndex]},
        remaining:belief.mass,selectedSourceCost:active.selectedSourceCost,
        selectedSemanticCost:active.selectedSemanticCost};
    }
    if(plan.symbol===null||inputs.length>=active.maxPublicQueries){
      throw new Error('No certified policy for current transcript');
    }
    const symbol=plan.symbol;
    const output=await api.step(symbol);
    if(output!==0&&output!==1)throw new RangeError('Expected binary output');
    const nextKey=belief.children[symbol][output];
    const nextPlan=plan.branches[output];
    if(nextKey===null||nextPlan===null){
      throw new Error('Observed output contradicts two-state stationary model');
    }
    inputs.push(symbol);
    outputs.push(output);
    key=nextKey;
    plan=nextPlan;
  }
}

module.exports={nondominatedPlans,createTwoStateRobustWorkspace,learnTwoStateRobustStepOnly};
