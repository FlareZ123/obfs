'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {binaryWords}=require('../sims/sco-sync-search');
const {makeGeneralMachine}=require('../sims/sco-sync-search-falsification');
const {observationallySynchronizes}=require('../sims/sco-sync-diversified-report');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');
const {makeVariableMachine}=require('../sims/sco-sync-state-size');

test('independent partition refinement detects a pair requiring a depth-three input',()=>{
  // Smallest witness found in the seeded four-state family at seed 6.
  const model={
    next:[[3,2],[3,0],[0,2],[1,3]],
    output:[[0,0],[0,0],[1,0],[0,0]]
  };
  function outputTrace(state,word) {
    const outputs=[];
    for(const symbol of word){
      outputs.push(model.output[state][symbol]);
      state=model.next[state][symbol];
    }
    return outputs;
  }
  for(const suffix of binaryWords(2)) {
    assert.deepEqual(outputTrace(1,suffix),outputTrace(3,suffix));
  }
  assert.deepEqual(outputTrace(1,[1,1,0]),[0,0,1]);
  assert.deepEqual(outputTrace(3,[1,1,0]),[0,0,0]);
  const classes=observableStateClasses(model);
  assert.notEqual(classes[1],classes[3]);
  assert.equal(observationallySynchronizes(model,[],[1,3]),false);
});

test('independent partition refinement matches complete suffix evaluator across 4000 seeded four-state machines',()=>{
  const seeds=[
    {base:0x9ab337e1,stride:7919},
    {base:0x6ca2de94,stride:10309},
    {base:0xdeadbeef,stride:21317},
    {base:0x13579bdf,stride:4567}
  ];
  const candidateWords=[[],...binaryWords(3)];
  let evaluations=0;
  for(const {base,stride} of seeds)for(let index=0;index<1000;index++){
    const model=makeGeneralMachine((base+Math.imul(index,stride))>>>0);
    const classes=observableStateClasses(model);
    for(const word of candidateWords){
      const terminals=model.next.map((_,state)=>
        word.reduce((previous,symbol)=>model.next[previous][symbol],state));
      const independentlyEquivalent=terminals.every(state=>
        classes[state]===classes[terminals[0]]);
      assert.equal(
        observationallySynchronizes(model,word,[0,1,2,3]),
        independentlyEquivalent,
        'seed='+base+', index='+index+', word='+word.join('')
      );
      evaluations++;
    }
  }
  assert.equal(evaluations,60000);
});

test('partition refinement agrees with full bounded traces for 6, 8, and 12 states',()=>{
  for(const {states,cases} of [
    {states:6,cases:64},{states:8,cases:64},{states:12,cases:8}
  ]){
    // A <=n-state deterministic binary Mealy machine can distinguish any
    // inequivalent pair with some word of length at most n-1.
    const suffixes=binaryWords(states-1);
    for(let index=0;index<cases;index++){
      const model=makeVariableMachine((0x6ca2de94+Math.imul(index,10309))>>>0,states);
      const classes=observableStateClasses(model);
      for(let left=0;left<states;left++)for(let right=left+1;right<states;right++){
        const equivalent=classes[left]===classes[right];
        let distinguished=false;
        for(const suffix of suffixes){
          let a=left,b=right;
          for(const symbol of suffix){
            if(model.output[a][symbol]!==model.output[b][symbol]){
              distinguished=true;
              break;
            }
            a=model.next[a][symbol];
            b=model.next[b][symbol];
          }
          if(distinguished)break;
        }
        assert.equal(equivalent,!distinguished,
          'states='+states+', seedIndex='+index+', pair='+left+','+right);
      }
    }
  }
});
