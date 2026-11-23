'use strict';

const {buildExplicitBeliefs}=require('./sco-step-only-two-state-independent');
const {semanticSourceWeights}=require('./sco-step-only-two-state-prior-sensitivity');

/** @typedef {[number,number]} CostPair */

/**
 * A minimal, exact Pareto filter: ascending source-call totals and strictly
 * decreasing semantic-weighted totals, eliminating dominated strategies.
 * @param {CostPair[]} candidates
 * @returns {CostPair[]}
 */
function pareto(candidates){
  /** @type {Map<number,number>} */
  const bySource=new Map();
  for(const [source,semantic] of candidates){
    if(!Number.isFinite(source)||!Number.isFinite(semantic))continue;
    const previous=bySource.get(source);
    if(previous===undefined||semantic<previous)bySource.set(source,semantic);
  }
  const ordered=[...bySource.entries()].sort((a,b)=>a[0]-b[0]);
  /** @type {CostPair[]} */
  const frontier=[];
  let lowestSemantic=Infinity;
  for(const [source,semantic] of ordered){
    if(semantic<lowestSemantic){
      frontier.push([source,semantic]);
      lowestSemantic=semantic;
    }
  }
  return frontier;
}

/**
 * Exhaust the *entire* nondominated two-prior policy space under a bound on
 * adaptive queries. Independent full-source-labelled belief vectors are used.
 * The semantic axis is scaled by 29 to keep every path cost integral.
 * @param {number} [maximumDepth]
 * @returns {{sourceModels:number,beliefStates:number,semanticScale:number,
 *   nineFrontier:CostPair[],tenFrontier:CostPair[],elevenFrontier:CostPair[],
 *   maxLocalFrontier:number,maxLocalCandidates:number}}
 */
function analyzeTwoStatePareto(maximumDepth=11){
  if(!Number.isSafeInteger(maximumDepth)||maximumDepth<11||maximumDepth>12){
    throw new RangeError('Expected a finite maximum depth of 11 or 12');
  }
  const graph=buildExplicitBeliefs();
  const {weights,scale}=semanticSourceWeights();
  const {beliefs,initialKey}=graph;
  /** @type {Map<string,number>} */
  const semanticMass=new Map();
  for(const [id,node] of beliefs){
    let sum=0;
    for(let i=0;i<node.states.length;i++)if(node.states[i]!==255)sum+=weights[i];
    semanticMass.set(id,sum);
  }
  /** @type {Map<string,CostPair[]>} */
  let previous=new Map();
  for(const [id,node] of beliefs)previous.set(id,node.terminal?[[0,0]]:[]);
  /** @type {CostPair[]} */
  /** @type {CostPair[]} */
  let nineFrontier=[];
  /** @type {CostPair[]} */
  let tenFrontier=[];
  /** @type {CostPair[]} */
  let elevenFrontier=[];
  let maxLocalFrontier=0,maxLocalCandidates=0;
  for(let depth=1;depth<=maximumDepth;depth++){
    /** @type {Map<string,CostPair[]>} */
    const updated=new Map();
    for(const [id,node] of beliefs){
      if(node.terminal){updated.set(id,[[0,0]]);continue;}
      /** @type {CostPair[]} */
      const candidates=[];
      const initialSemanticMass=semanticMass.get(id);
      if(initialSemanticMass===undefined)throw new Error('Missing semantic belief mass');
      for(const action of [0,1]){
        /** @type {string[]} */
        const children=[];
        for(const child of node.children[action])if(child!==null)children.push(child);
        const fronts=children.map(child=>previous.get(child));
        if(fronts.some(front=>front===undefined||front.length===0))continue;
        if(children.length===1){
          const front=fronts[0];
          if(!front)throw new Error('Missing singleton branch cost');
          for(const [source,semantic] of front){
            candidates.push([node.mass+source,initialSemanticMass+semantic]);
          }
        }else if(children.length===2){
          const first=fronts[0],second=fronts[1];
          if(!first||!second)throw new Error('Missing two-branch costs');
          for(const [a,b] of first)for(const [c,d] of second){
            candidates.push([node.mass+a+c,initialSemanticMass+b+d]);
          }
        }else throw new Error('Nonterminal input has no possible output');
      }
      maxLocalCandidates=Math.max(maxLocalCandidates,candidates.length);
      const frontier=pareto(candidates);
      maxLocalFrontier=Math.max(maxLocalFrontier,frontier.length);
      updated.set(id,frontier);
    }
    previous=updated;
    const initial=updated.get(initialKey);
    if(!initial)throw new Error('Missing initial Pareto posterior');
    if(depth===9)nineFrontier=initial;
    if(depth===10)tenFrontier=initial;
    if(depth===11)elevenFrontier=initial;
  }
  return {sourceModels:graph.models.length,beliefStates:graph.statesVisited,
    semanticScale:scale,nineFrontier,tenFrontier,elevenFrontier,
    maxLocalFrontier,maxLocalCandidates};
}

if(require.main===module)console.log(JSON.stringify(analyzeTwoStatePareto()));
module.exports={pareto,analyzeTwoStatePareto};
