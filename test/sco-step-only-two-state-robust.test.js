'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {distinguish}=require('../sims/sco-step-only-version-space');
const {nondominatedPlans,createTwoStateRobustWorkspace,learnTwoStateRobustStepOnly}=
  require('../sims/sco-step-only-two-state-robust');

test('Pareto policy witness selection uses nondominated pairs with stable tie-breaking',()=>{
  /** @type {Parameters<typeof nondominatedPlans>[0]} */
  const plans=[
    {source:2,semantic:7,symbol:0,branches:[null,null]},
    {source:2,semantic:9,symbol:1,branches:[null,null]},
    {source:3,semantic:6,symbol:1,branches:[null,null]},
    {source:4,semantic:6,symbol:0,branches:[null,null]}
  ];
  assert.deepEqual(nondominatedPlans(plans).map(p=>[p.source,p.semantic]),[[2,7],[3,6]]);
});

test('robust adaptive public-only learner attains the exact compromise Pareto point',async()=>{
  const workspace=createTwoStateRobustWorkspace();
  assert.deepEqual(workspace.frontier,[
    {source:1776,semantic:1104},
    {source:1799,semantic:1099},
    {source:1822,semantic:1094},
    {source:1845,semantic:1089},
    {source:1868,semantic:1084}
  ]);
  assert.equal(workspace.selectedSourceCost,1799);
  assert.equal(workspace.selectedSemanticCost,1099);
  assert.ok(workspace.maxProportionalRegret<0.014);
  /** @type {number[]} */
  const histogram=[];
  /** @type {number[]} */
  const byModel=[];
  for(const model of workspace.graph.models){
    let privateState=0,received=0;
    const api={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        received++;
        const previous=privateState;
        privateState=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const found=await learnTwoStateRobustStepOnly(api,workspace);
    assert.equal(found.certified,true);
    assert.equal(found.queries,received);
    assert.ok(received<=10);
    assert.equal(found.inputs.length,received);
    assert.equal(found.outputs.length,received);
    assert.equal(found.selectedSourceCost,1799);
    assert.equal(found.selectedSemanticCost,1099);
    assert.equal(distinguish(found.clone,{...model,state:privateState}),null,
      'clone must be equivalent to actual current state on every future input');
    byModel.push(received);
    histogram[received]=(histogram[received]||0)+1;
  }
  const total=byModel.reduce((sum,value)=>sum+value,0);
  assert.equal(total,1799);
  assert.equal(Math.max(...byModel),10);
  console.log('SCO_TWO_STATE_ROBUST '+JSON.stringify({sourceTotal:total,
    semanticTotal:workspace.selectedSemanticCost,frontier:workspace.frontier,
    maxRegret:workspace.maxProportionalRegret,
    histogram:Array.from({length:histogram.length},(_,index)=>histogram[index]||0)}));
});

test('robust learner refuses non-binary public output',async()=>{
  const workspace=createTwoStateRobustWorkspace();
  await assert.rejects(()=>learnTwoStateRobustStepOnly({async step(){return 2;}},workspace),
    /binary output/);
});
