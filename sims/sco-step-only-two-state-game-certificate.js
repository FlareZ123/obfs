'use strict';

const {buildExplicitBeliefs}=require('./sco-step-only-two-state-independent');

/**
 * Rank every reachable source-labelled belief by its exact minimax worst-case
 * number of further public step calls required for continuation equivalence.
 * This second route uses 260-entry labelled vectors, never semantic signatures.
 *
 * @param {ReturnType<typeof buildExplicitBeliefs>} graph
 * @returns {Map<string,number>}
 */
function minimaxRanks(graph){
  /** @type {Map<string,number>} */
  const ranks=new Map();
  for(const [key,node] of graph.beliefs)if(node.terminal)ranks.set(key,0);
  for(let depth=1;depth<=graph.statesVisited;depth++){
    /** @type {string[]} */
    const newlyWinning=[];
    for(const [key,node] of graph.beliefs){
      if(ranks.has(key))continue;
      const possible=node.children.some(branch=>branch.every(child=>child===null||ranks.has(child)));
      if(possible)newlyWinning.push(key);
    }
    if(newlyWinning.length===0)break;
    for(const key of newlyWinning)ranks.set(key,depth);
  }
  if(ranks.size!==graph.statesVisited)throw new Error('Uncertifiable source-labelled belief');
  return ranks;
}

/**
 * Independently constructively verify both sides of the lower/upper bound:
 * - every nonterminal belief admits a finite winning attacker action;
 * - for every attacker action, the defender can choose a legal output branch
 *   that preserves at least rank-1 future query difficulty;
 * - a specific adversarial response policy leaves a nonterminal belief after
 *   any eight input bits, with at least one fixed original model reproducing
 *   the whole resulting transcript;
 * - a rank-decreasing attacker policy terminates for every legal output path.
 * @returns {{sourceModels:number,explicitBeliefs:number,rootRank:number,
 *   nonterminalBeliefs:number,defenderEightStepTapes:number,
 *   nonterminalEightStepTapes:number,maximumAttackerDepth:number,
 *   upperTreeLeaves:number,minimumEightStepRemaining:number,
 *   maximumEightStepRemaining:number}}
 */
function certifyTwoStateMinimaxGame(){
  const graph=buildExplicitBeliefs();
  const {models,beliefs,initialKey}=graph;
  const rank=minimaxRanks(graph);
  let nonterminalBeliefs=0;
  for(const [key,node] of beliefs){
    const r=rank.get(key);
    if(r===undefined)throw new Error('Belief missing winning rank');
    if(node.terminal){if(r!==0)throw new Error('Terminal rank is not zero');continue;}
    nonterminalBeliefs++;
    /** @type {number[]} */
    const actionWorst=[];
    for(const action of [0,1]){
      let worst=-1;
      for(const child of node.children[action]){
        if(child===null)continue;
        const childRank=rank.get(child);
        if(childRank===undefined)throw new Error('Unknown successor rank');
        worst=Math.max(worst,childRank);
      }
      actionWorst.push(1+worst);
      if(1+worst<r)throw new Error('Attacker action beats claimed lower bound');
    }
    if(Math.min(...actionWorst)!==r)throw new Error('Claimed minimax upper bound is not attainable');
  }
  if(rank.get(initialKey)!==9)throw new Error('Incorrect initial minimax rank');

  let minimumEightStepRemaining=Infinity,maximumEightStepRemaining=0,nonterminalEightStepTapes=0;
  for(let mask=0;mask<256;mask++){
    let key=initialKey;
    /** @type {number[]} */
    const inputs=[],outputs=[];
    for(let step=0;step<8;step++){
      const node=beliefs.get(key);
      const before=rank.get(key);
      if(!node||before===undefined||node.terminal)throw new Error('Defender cannot delay certification');
      const symbol=(mask>>step)&1;
      let chosen=null,bestRank=-1,bestOutput=-1;
      for(let output=0;output<2;output++){
        const child=node.children[symbol][output];
        if(child===null)continue;
        const childRank=rank.get(child);
        if(childRank===undefined)throw new Error('Missing delayed-child rank');
        if(childRank>bestRank){chosen=child;bestRank=childRank;bestOutput=output;}
      }
      if(chosen===null||bestRank<before-1)throw new Error('Adversary lacks lower-bound response');
      inputs.push(symbol);outputs.push(bestOutput);
      key=chosen;
    }
    const final=beliefs.get(key),endRank=rank.get(key);
    if(!final||final.terminal||endRank===undefined||endRank<1){
      throw new Error('Eight-query adversarial prefix permitted certification');
    }
    nonterminalEightStepTapes++;
    minimumEightStepRemaining=Math.min(minimumEightStepRemaining,final.mass);
    maximumEightStepRemaining=Math.max(maximumEightStepRemaining,final.mass);
    // A *single fixed* source table must reproduce this whole adaptive tape.
    const original=final.states.findIndex(state=>state!==255);
    if(original<0)throw new Error('No fixed oracle model matches adversarial path');
    let state=0;
    for(let step=0;step<8;step++){
      const symbol=inputs[step],observed=outputs[step];
      if(models[original].output[state][symbol]!==observed){
        throw new Error('Adversarial replies inconsistent with fixed original model');
      }
      state=models[original].next[state][symbol];
    }
    if(state!==final.states[original])throw new Error('Incorrect final private state');
  }

  /** @type {{key:string,depth:number}[]} */
  const stack=[{key:initialKey,depth:0}];
  let maximumAttackerDepth=0,upperTreeLeaves=0;
  while(stack.length){
    const item=stack.pop();
    if(!item)throw new Error('Empty search item');
    const {key,depth}=item;
    const node=beliefs.get(key),r=rank.get(key);
    if(!node||r===undefined)throw new Error('Unknown attacker belief');
    if(node.terminal){
      upperTreeLeaves++;
      maximumAttackerDepth=Math.max(maximumAttackerDepth,depth);
      continue;
    }
    const action=[0,1].find(symbol=>
      node.children[symbol].every(child=>child===null||(rank.get(child)??Infinity)<r));
    if(action===undefined)throw new Error('No rank-decreasing attacker action');
    for(const child of node.children[action]){
      if(child!==null)stack.push({key:child,depth:depth+1});
    }
  }
  if(maximumAttackerDepth!==9)throw new Error('Upper strategy did not match lower bound');
  return {sourceModels:models.length,explicitBeliefs:beliefs.size,rootRank:rank.get(initialKey)??-1,
    nonterminalBeliefs,defenderEightStepTapes:256,nonterminalEightStepTapes,
    maximumAttackerDepth,upperTreeLeaves,
    minimumEightStepRemaining,maximumEightStepRemaining};
}

if(require.main===module)console.log(JSON.stringify(certifyTwoStateMinimaxGame()));
module.exports={minimaxRanks,certifyTwoStateMinimaxGame};
