'use strict';

const {buildBehaviorTypes,analyzeTwoStateMinimax}=require('./sco-step-only-two-state-minimax');
const {buildWeightedBeliefs,weightedBellmanLayers,evaluateWeightedPolicy}=
  require('./sco-step-only-two-state-expected');
const {buildExplicitBeliefs,rootedEquivalence}=
  require('./sco-step-only-two-state-independent');
const {enumerateMachines,chooseSymbol}=require('./sco-step-only-version-space');

/**
 * Uniform prior on the distinct *initial* future behavior functions, each of
 * which is realizable by at least one of the 260 labelled original models.
 * @param {ReturnType<typeof buildBehaviorTypes>} all
 */
function uniqueInitialBehaviors(all){
  const seen=new Set();
  /** @type {typeof all.models} */
  const models=[];
  for(let index=0;index<all.rootTypes.length;index++){
    const behavior=all.rootTypes[index];
    if(seen.has(behavior))continue;
    seen.add(behavior);
    models.push(all.models[index]);
  }
  return {...all,rootTypes:[...seen],models};
}

/**
 * Count calls under the current unmodified greedy public learner on a
 * representative of every distinct initial behavior function.
 * @param {ReturnType<typeof uniqueInitialBehaviors>} types
 * @returns {number}
 */
function baselineTotal(types){
  let total=0;
  for(const model of types.models){
    const hypotheses=enumerateMachines(2);
    let state=0,queries=0;
    for(;queries<=20;queries++){
      const choice=chooseSymbol(hypotheses);
      if(choice.certified)break;
      if(choice.symbol===null)throw new Error('Uncertified hypothesis without a query');
      const symbol=choice.symbol;
      const observed=model.output[state][symbol];
      state=model.next[state][symbol];
      for(let i=hypotheses.length-1;i>=0;i--){
        const candidate=hypotheses[i];
        if(candidate.output[candidate.state][symbol]!==observed){
          hypotheses.splice(i,1);
        }else candidate.state=candidate.next[candidate.state][symbol];
      }
    }
    if(queries>20)throw new Error('Greedy baseline exhausted');
    total+=queries;
  }
  return total;
}

/**
 * Independent exact weighting of every *original labelled table* by the
 * reciprocal of its initial observational-equivalence class size. In this
 * model family class sizes are 1 or 29; scale by 29 to keep integer costs.
 * @returns {{scale:number,weights:Uint8Array,sourceModels:number,
 *   uniqueBehaviors:number,sourceClassSizes:Record<string,number>}}
 */
function semanticSourceWeights(){
  const graph=buildExplicitBeliefs();
  const {models}=graph;
  const {pairs,offsets,rooted}=rootedEquivalence(models);
  const classSizes=new Uint8Array(models.length);
  for(let i=0;i<models.length;i++){
    let count=0;
    for(let j=0;j<models.length;j++){
      if(pairs[offsets[i]*rooted+offsets[j]]===1)count++;
    }
    classSizes[i]=count;
  }
  /** @type {Record<string,number>} */
  const sourceClassSizes={};
  for(const count of new Set(classSizes)){
    sourceClassSizes[String(count)]=classSizes.filter(n=>n===count).length/count;
  }
  if(classSizes.some(count=>count!==1&&count!==29)){
    throw new Error('Unexpected semantic equivalence-class multiplicity');
  }
  return {scale:29,weights:Uint8Array.from(classSizes,count=>29/count),
    sourceModels:models.length,uniqueBehaviors:Object.values(sourceClassSizes).reduce((a,b)=>a+b,0),
    sourceClassSizes};
}

/**
 * Run a *second* uncompressed weighted DP whose beliefs are 260-entry source
 * state vectors. It shares no semantic-type map with the primary analysis.
 * @returns {{nineScaled:number,unboundedScaled:number,scale:number,states:number,
 *   convergedDepth:number}}
 */
function independentSemanticOptimum(){
  const graph=buildExplicitBeliefs();
  const {weights,scale}=semanticSourceWeights();
  const {beliefs,initialKey,statesVisited}=graph;
  /** @type {Map<string,number>} */
  let costs=new Map();
  for(const [key,node] of beliefs)costs.set(key,node.terminal?0:Infinity);
  let nineScaled=Infinity,unboundedScaled=Infinity,convergedDepth=0;
  for(let depth=1;depth<=statesVisited;depth++){
    /** @type {Map<string,number>} */
    const updated=new Map();
    let changed=false;
    for(const [key,node] of beliefs){
      if(node.terminal){updated.set(key,0);continue;}
      let mass=0;
      for(let i=0;i<node.states.length;i++){
        if(node.states[i]!==255)mass+=weights[i];
      }
      let best=Infinity;
      for(const children of node.children){
        let total=mass;
        for(const child of children){
          if(child!==null)total+=costs.get(child)??Infinity;
        }
        best=Math.min(best,total);
      }
      updated.set(key,best);
      if(best!==costs.get(key))changed=true;
    }
    costs=updated;
    if(depth===9)nineScaled=costs.get(initialKey)??Infinity;
    if(!changed){
      convergedDepth=depth;
      unboundedScaled=costs.get(initialKey)??Infinity;
      break;
    }
  }
  if(!Number.isFinite(nineScaled)||!Number.isFinite(unboundedScaled)){
    throw new Error('Explicit semantic-prior oracle DP did not certify');
  }
  return {nineScaled,unboundedScaled,scale,states:graph.statesVisited,convergedDepth};
}

/**
 * Quantify the effect of the attacker's publicly assumed model distribution.
 * Every number is a complete finite-model count, not a sampling estimate.
 */
function analyzeTwoStatePriorSensitivity(){
  const all=buildBehaviorTypes();
  const semantic=uniqueInitialBehaviors(all);
  const baselineSource=analyzeTwoStateMinimax().heuristicHistogram
    .reduce((total,count,depth)=>total+count*depth,0);
  const baselineSemantic=baselineTotal(semantic);
  /** @param {ReturnType<typeof buildBehaviorTypes>} prior */
  function scenarios(prior){
    const graph=buildWeightedBeliefs(prior);
    const solved=weightedBellmanLayers(graph);
    if(!solved.allStatesFixed)throw new Error('Posterior graph did not converge');
    /** @param {number} horizon */
    function at(horizon){
      return {
        labelled:evaluateWeightedPolicy(all,graph,solved.layers,horizon).total,
        semantic:evaluateWeightedPolicy(semantic,graph,solved.layers,horizon).total
      };
    }
    return {priorMass:graph.beliefs.get(graph.initialKey)?.mass,
      states:graph.keys.length,convergedDepth:solved.convergenceDepth,
      nine:at(9),expected:at(solved.convergenceDepth-1)};
  }
  return {sourceModels:all.models.length,initialBehaviors:semantic.models.length,
    baseline:{labelled:baselineSource,semantic:baselineSemantic},
    labelledPrior:scenarios(all),semanticPrior:scenarios(semantic),
    explicitSemantic:independentSemanticOptimum(),
    classSizes:semanticSourceWeights().sourceClassSizes};
}

if(require.main===module)console.log(JSON.stringify(analyzeTwoStatePriorSensitivity()));
module.exports={uniqueInitialBehaviors,semanticSourceWeights,
  independentSemanticOptimum,analyzeTwoStatePriorSensitivity};
