'use strict';

const {buildBehaviorTypes,analyzeTwoStateMinimax}=require('./sco-step-only-two-state-minimax');

/**
 * Construct posterior-weighted beliefs under the uniform prior on the 260
 * *labelled* source models. Each count is the number of original models whose
 * active residual behavior is the given semantic type. This retains the full
 * posterior distribution without keeping 260 separately labelled candidates.
 *
 * @param {ReturnType<typeof buildBehaviorTypes>} types
 * @returns {{initialKey:string,beliefs:Map<string,{weights:Uint16Array,
 *   mass:number,terminal:boolean,branches:[(string|null)[],(string|null)[]]}>,
 *   keys:string[]}}
 */
function buildWeightedBeliefs(types){
  const {outputs,successors,rootTypes}=types;
  /** @param {Uint16Array} counts @returns {string} */
  const key=counts=>Array.from(counts).join(',');
  const first=new Uint16Array(outputs.length);
  for(const type of rootTypes)first[type]++;
  const initialKey=key(first);
  /** @type {Map<string,{weights:Uint16Array,mass:number,terminal:boolean,
   *   branches:[(string|null)[],(string|null)[]]}>} */
  const beliefs=new Map();
  /** @type {string[]} */
  const keys=[];
  /** @param {Uint16Array} counts @returns {string} */
  function register(counts){
    const id=key(counts);
    if(!beliefs.has(id)){
      let mass=0,distinct=0;
      for(const value of counts){
        mass+=value;
        if(value!==0)distinct++;
      }
      beliefs.set(id,{weights:counts,mass,terminal:distinct===1,
        branches:[[null,null],[null,null]]});
      keys.push(id);
    }
    return id;
  }
  register(first);
  for(let cursor=0;cursor<keys.length;cursor++){
    const id=keys[cursor];
    const belief=beliefs.get(id);
    if(!belief)throw new Error('Unknown posterior belief');
    if(belief.terminal)continue;
    for(let symbol=0;symbol<2;symbol++){
      const children=[new Uint16Array(outputs.length),new Uint16Array(outputs.length)];
      for(let type=0;type<belief.weights.length;type++){
        const count=belief.weights[type];
        if(count!==0){
          children[outputs[type][symbol]][successors[type][symbol]]+=count;
        }
      }
      for(let output=0;output<2;output++){
        const child=children[output];
        if(child.some(value=>value!==0))belief.branches[symbol][output]=register(child);
      }
    }
  }
  return {initialKey,beliefs,keys};
}

/**
 * Compute integer total-cost Bellman layers. For a belief containing m
 * surviving equally probable source models, every additional query costs m
 * aggregate calls across that subpopulation. Terminal equivalence costs 0.
 * The first layer with no changes is a finite exact fixed point; positive
 * per-query costs rule out a cheaper policy that loops forever.
 *
 * @param {ReturnType<typeof buildWeightedBeliefs>} graph
 * @returns {{layers:Map<string,number>[],convergenceDepth:number,
 *   allStatesFixed:boolean}}
 */
function weightedBellmanLayers(graph){
  const {keys,beliefs}=graph;
  /** @type {Map<string,number>[]} */
  const layers=[];
  /** @type {Map<string,number>} */
  const initial=new Map();
  for(const id of keys)initial.set(id,beliefs.get(id)?.terminal?0:Infinity);
  layers.push(initial);
  for(let depth=1;depth<=keys.length;depth++){
    const old=layers[layers.length-1];
    /** @type {Map<string,number>} */
    const updated=new Map();
    let changed=0;
    for(const id of keys){
      const belief=beliefs.get(id);
      if(!belief)throw new Error('Missing posterior belief');
      if(belief.terminal){updated.set(id,0);continue;}
      let best=Infinity;
      for(const branch of belief.branches){
        let total=belief.mass;
        for(const child of branch){
          if(child!==null)total+=old.get(child)??Infinity;
        }
        best=Math.min(best,total);
      }
      updated.set(id,best);
      if(best!==old.get(id))changed++;
    }
    layers.push(updated);
    if(changed===0)return {layers,convergenceDepth:depth,allStatesFixed:true};
  }
  return {layers,convergenceDepth:keys.length,allStatesFixed:false};
}

/**
 * Evaluate the exact optimal posterior policy at a chosen worst-case horizon
 * on every original labelled model, observing its actual responses.
 * @param {ReturnType<typeof buildBehaviorTypes>} types
 * @param {ReturnType<typeof buildWeightedBeliefs>} graph
 * @param {Map<string,number>[]} layers
 * @param {number} horizon
 * @returns {{total:number,histogram:number[]}}
 */
function evaluateWeightedPolicy(types,graph,layers,horizon){
  /** @type {number[]} */
  const histogram=[];
  for(const model of types.models){
    let state=0,beliefKey=graph.initialKey,queries=0;
    for(;queries<=horizon;queries++){
      const belief=graph.beliefs.get(beliefKey);
      if(!belief)throw new Error('Missing posterior during replay');
      if(belief.terminal)break;
      if(queries===horizon)throw new Error('Posterior policy exceeded query horizon');
      const costs=layers[horizon-queries-1];
      if(!costs)throw new Error('Missing horizon cost layer');
      const scores=belief.branches.map(children=>children.reduce((sum,id)=>
        sum+(id===null?0:costs.get(id)??Infinity),0));
      const symbol=scores[0]<=scores[1]?0:1;
      const observed=model.output[state][symbol];
      state=model.next[state][symbol];
      const next=belief.branches[symbol][observed];
      if(next===null)throw new Error('Observed impossible posterior response');
      beliefKey=next;
    }
    histogram[queries]=(histogram[queries]||0)+1;
  }
  return {total:histogram.reduce((sum,count,depth)=>sum+count*depth,0),
    histogram:Array.from({length:histogram.length},(_,index)=>histogram[index]||0)};
}

/**
 * Exact expectation with a uniformly chosen initial *labelled* machine,
 * in contrast to the minimax analysis which assumes adversarial selection.
 * @returns {{weightedBeliefs:number,unboundedConverged:boolean,
 *   convergenceDepth:number,boundedNineTotal:number,optimalTotal:number,
 *   nineHistogram:number[],optimalHistogram:number[],baselineTotal:number}}
 */
function analyzeTwoStateExpectedQueries(){
  const types=buildBehaviorTypes();
  const graph=buildWeightedBeliefs(types);
  const solved=weightedBellmanLayers(graph);
  if(!solved.allStatesFixed)throw new Error('Posterior cost solution did not converge');
  const finite=solved.layers[solved.layers.length-1].get(graph.initialKey);
  if(finite===undefined||!Number.isFinite(finite))throw new Error('Initial posterior not solvable');
  const nine=evaluateWeightedPolicy(types,graph,solved.layers,9);
  const optimum=evaluateWeightedPolicy(types,graph,solved.layers,solved.convergenceDepth-1);
  return {weightedBeliefs:graph.keys.length,unboundedConverged:true,
    convergenceDepth:solved.convergenceDepth,boundedNineTotal:nine.total,
    optimalTotal:optimum.total,nineHistogram:nine.histogram,
    optimalHistogram:optimum.histogram,
    baselineTotal:analyzeTwoStateMinimax().heuristicHistogram.reduce((sum,count,depth)=>sum+count*depth,0)};
}

/**
 * Reusable, immutable-by-convention decision table for independent step-only
 * attacks. Construct once and reuse for any number of unrelated model runs.
 * Its full-model prior is uniform over 260 labelled initial source tables.
 */
function createTwoStateWeightedWorkspace(){
  const types=buildBehaviorTypes();
  const graph=buildWeightedBeliefs(types);
  const solved=weightedBellmanLayers(graph);
  if(!solved.allStatesFixed)throw new Error('Incomplete exact posterior decision table');
  return {types,graph,layers:solved.layers,convergenceDepth:solved.convergenceDepth};
}

/**
 * Use only an authorized public, continuously advancing step(bit) API to
 * obtain a semantically exact continuation clone under the trusted <=2-state
 * deterministic binary Mealy assumption. No reset or private table is used.
 *
 * 'boundedNine' minimizes prior-weighted average steps subject to a hard
 * nine-query maximum. 'expected' globally minimizes prior-weighted average
 * steps and has a worst-case limit of ten. Both policies are exact for the
 * specified uniform prior over 260 labelled original models.
 *
 * @param {{step:(symbol:number)=>Promise<number>}} api
 * @param {'boundedNine'|'expected'} [policy]
 * @param {ReturnType<typeof createTwoStateWeightedWorkspace>} [workspace]
 * @returns {Promise<{certified:boolean,queries:number,remaining:number,
 *   inputs:number[],outputs:number[],clone:{next:number[][],output:number[][],
 *   state:number},modelBound:2,modelCount:number,posteriorStates:number,
 *   policy:'boundedNine'|'expected'}>}
 */
async function learnTwoStateWeightedStepOnly(api,policy='boundedNine',workspace){
  if(policy!=='boundedNine'&&policy!=='expected'){
    throw new RangeError('policy must be boundedNine or expected');
  }
  const prepared=workspace||createTwoStateWeightedWorkspace();
  const {types,graph,layers,convergenceDepth}=prepared;
  const horizon=policy==='boundedNine'?9:convergenceDepth-1;
  let beliefKey=graph.initialKey;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  for(let query=0;query<=horizon;query++){
    const belief=graph.beliefs.get(beliefKey);
    if(!belief)throw new Error('Missing reachable posterior belief');
    if(belief.terminal){
      const behavior=belief.weights.findIndex(count=>count!==0);
      const representative=types.rooted[types.types.indexOf(behavior)];
      if(!representative)throw new Error('Missing terminal behavioral model');
      const clone={
        next:representative.model.next.map(row=>row.slice()),
        output:representative.model.output.map(row=>row.slice()),
        state:representative.state
      };
      return {certified:true,queries:inputs.length,remaining:belief.mass,
        inputs,outputs,clone,modelBound:2,modelCount:types.models.length,
        posteriorStates:graph.keys.length,policy};
    }
    if(query===horizon)throw new Error('Exact posterior policy exceeded proven worst case');
    const costs=layers[horizon-query-1];
    if(!costs)throw new Error('Missing posterior policy cost layer');
    const scores=belief.branches.map(children=>children.reduce((sum,id)=>
      sum+(id===null?0:costs.get(id)??Infinity),0));
    const symbol=scores[0]<=scores[1]?0:1;
    const observed=await api.step(symbol);
    if(observed!==0&&observed!==1)throw new RangeError('Expected binary output');
    const next=belief.branches[symbol][observed];
    if(next===null)throw new Error('Observed oracle violates declared two-state bound');
    inputs.push(symbol);
    outputs.push(observed);
    beliefKey=next;
  }
  throw new Error('Unreachable learner termination');
}

module.exports={buildWeightedBeliefs,weightedBellmanLayers,evaluateWeightedPolicy,
  analyzeTwoStateExpectedQueries,createTwoStateWeightedWorkspace,
  learnTwoStateWeightedStepOnly};

