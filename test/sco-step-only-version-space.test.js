'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {binaryWords}=require('../sims/sco-sync-search');
const {makeIndependentMachine}=require('../sims/sco-sync-independent-distribution');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');
const {FOUR_STATE_MODEL_COUNT,decodeFourStateCode,firstDistinguishingSymbol}=
  require('../sims/sco-step-only-four-state');
const {enumerateMachines,distinguish,learnBoundedStepOnly,predictContinuation,createContinuationClone}=
  require('../sims/sco-step-only-version-space');

/**
 * The evaluator knows the true machine; the public attacker only receives
 * its asynchronous step callback. No reset method is provided.
 * @param {{next:number[][],output:number[][]}} model
 * @param {number} maxStates
 * @param {number} maxQueries
 */
async function evaluate(model,maxStates,maxQueries){
  let state=0,received=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      received++;
      const previous=state;
      state=model.next[previous][symbol];
      return model.output[previous][symbol];
    }
  };
  const found=await learnBoundedStepOnly(api,maxStates,maxQueries);
  assert.equal(found.queries,received);
  assert.equal(found.inputs.length,received);
  assert.equal(found.outputs.length,received);
  if(found.certified){
    assert.ok(found.clone);
    // Independently verify the certificate against the private fixture for
    // every held-out binary word of length at most eight.
    for(const word of binaryWords(8)){
      /** @type {number[]} */
      const expected=[];
      let privateState=state;
      for(const symbol of word){
        expected.push(model.output[privateState][symbol]);
        privateState=model.next[privateState][symbol];
      }
      assert.deepEqual(predictContinuation(found.clone,word),expected);
    }
  }
  return found;
}

/** @param {number} seed @param {number} count @returns {number[][]} */
function independentHeldout(seed,count){
  let random=seed>>>0;
  /** @type {number[][]} */
  const words=[];
  for(let index=0;index<count;index++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%60);
    /** @type {number[]} */
    const word=[];
    for(let offset=0;offset<length;offset++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)&1);
    }
    words.push(word);
  }
  return words;
}

/**
 * Independently compare two rooted machines by putting their disjoint union
 * through the separate fixed-point partition-refinement implementation.
 * @param {{next:number[][],output:number[][],state:number}} left
 * @param {{next:number[][],output:number[][],state:number}} right
 * @returns {boolean}
 */
function equivalentFromStates(left,right){
  const offset=left.next.length;
  const next=[
    ...left.next.map(row=>row.slice()),
    ...right.next.map(row=>row.map(state=>state+offset))
  ];
  const output=[
    ...left.output.map(row=>row.slice()),
    ...right.output.map(row=>row.slice())
  ];
  const classes=observableStateClasses({next,output});
  return classes[left.state]===classes[offset+right.state];
}

/**
 * @param {{next:number[][],output:number[][],state:number}} model
 * @param {readonly number[]} word
 * @returns {number[]}
 */
function traceFrom(model,word){
  let state=model.state;
  /** @type {number[]} */
  const outputs=[];
  for(const symbol of word){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}

test('version space enumerates every labeled binary machine through three states',()=>{
  assert.equal(enumerateMachines(1).length,4);
  assert.equal(enumerateMachines(2).length,260);
  assert.equal(enumerateMachines(3).length,46916);
  assert.throws(()=>enumerateMachines(4),RangeError);
});

test('product search distinguishes different states and recognizes equivalent traces',()=>{
  const first={next:[[0,1],[1,1]],output:[[0,0],[1,1]],state:0};
  const second={next:[[0,1],[1,1]],output:[[0,0],[1,1]],state:1};
  assert.deepEqual(distinguish(first,second),[0]);
  assert.equal(distinguish(first,{...first}),null);
  const alwaysZero={next:[[1,1],[0,0]],output:[[0,0],[0,0]],state:0};
  assert.equal(distinguish(first,alwaysZero) instanceof Array,true);
});

test('packed four-state product BFS returns the first symbol of a shortest witness',()=>{
  let random=0x12345678;
  for(let index=0;index<100000;index++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const leftCode=random&0xffffff,leftState=(random>>>24)&3;
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const rightCode=random&0xffffff,rightState=(random>>>24)&3;
    const left=decodeFourStateCode(leftCode,leftState);
    const right=decodeFourStateCode(rightCode,rightState);
    const witness=distinguish(left,right);
    assert.equal(firstDistinguishingSymbol(leftCode,leftState,rightCode,rightState),
      witness===null?null:witness[0],String(index));
  }
});

test('every one- and two-state binary machine has certified continuation without reset',async()=>{
  let certified=0;
  let maxQueries=0;
  for(const model of enumerateMachines(2)){
    const result=await evaluate(model,2,64);
    assert.equal(result.certified,true);
    certified++;
    maxQueries=Math.max(maxQueries,result.queries);
  }
  assert.equal(certified,260);
  assert.equal(maxQueries,9);
});

test('independent three-state private machines admit certified held-out continuation',async()=>{
  for(let index=0;index<24;index++){
    const seed=(0xa82b11f5+Math.imul(index,4973))>>>0;
    const result=await evaluate(makeIndependentMachine(seed,3),3,64);
    assert.equal(result.certified,true,String(seed));
    assert.ok(result.queries<=27);
  }
});

test('compact complete four-state space certifies independent no-reset machines',async()=>{
  const corpora=[
    {name:'base',base:0xa82b11f5,stride:4973},
    {name:'holdout',base:0x51a9c603,stride:8467}
  ];
  const records=[];
  for(const corpus of corpora)for(let index=0;index<4;index++){
    const seed=(corpus.base+Math.imul(index,corpus.stride))>>>0;
    const model=makeIndependentMachine(seed,4);
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
    const result=await learnBoundedStepOnly(api,4,128);
    assert.equal(result.certified,true,corpus.name+':'+index);
    assert.equal(result.queries,received);
    assert.equal(result.modelBound,4);
    assert.equal(result.modelCount,FOUR_STATE_MODEL_COUNT);
    assert.ok(typeof result.scanWork==='number'&&result.scanWork>0);
    assert.ok(typeof result.equivalenceChecks==='number'&&result.equivalenceChecks>=0);
    assert.ok(typeof result.productPairs==='number'&&result.productPairs>=0);
    assert.ok(typeof result.elapsedMs==='number'&&result.elapsedMs>0);
    assert.ok(result.clone);
    const hidden={...model,state:privateState};
    assert.equal(equivalentFromStates(result.clone,hidden),true,
      corpus.name+':'+index+' exact partition refinement');
    for(const word of independentHeldout((0x87bd1a12+Math.imul(index,10309))>>>0,128)){
      assert.deepEqual(traceFrom(result.clone,word),traceFrom(hidden,word),
        corpus.name+':'+index+':'+word.join(''));
    }
    records.push({
      corpus:corpus.name,index,seed:'0x'+seed.toString(16),
      queries:result.queries,remaining:result.remaining,scanWork:result.scanWork||0,
      equivalenceChecks:result.equivalenceChecks||0,productPairs:result.productPairs||0,
      elapsedMs:result.elapsedMs||0
    });
  }
  const queries=records.map(record=>record.queries);
  const elapsed=records.map(record=>record.elapsedMs);
  console.log('STEP_ONLY_FOUR_STATE '+JSON.stringify({
    models:records.length,certified:records.length,heldout:records.length*128,
    minQueries:Math.min(...queries),maxQueries:Math.max(...queries),
    meanQueries:queries.reduce((sum,value)=>sum+value,0)/queries.length,
    maxElapsedMs:Math.max(...elapsed),
    totalScanWork:records.reduce((sum,record)=>sum+record.scanWork,0)
  }));
  assert.equal(records.length,8);
  assert.ok(Math.max(...queries)<=128);
});

test('compact four-state space also covers smaller machines through unreachable padding',async()=>{
  for(const states of [2,3]){
    const model=makeIndependentMachine(states===2?0x51a9c603:0x7e2df0b1,states);
    let privateState=0;
    const api={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        const previous=privateState;
        privateState=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const result=await learnBoundedStepOnly(api,4,128);
    assert.equal(result.certified,true,'states='+states);
    assert.ok(result.clone);
    assert.equal(equivalentFromStates(result.clone,{...model,state:privateState}),true);
  }
});

test('a five-state delayed-output machine falsifies an understated four-state bound',async()=>{
  const size=5;
  const hidden={
    next:Array.from({length:size},(_,state)=>[Math.min(state+1,size-1),0]),
    output:Array.from({length:size},(_,state)=>[state===size-2?1:0,0])
  };
  assert.equal(new Set(observableStateClasses(hidden)).size,5,
    'the hidden machine must really require five observable states');
  let privateState=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      const previous=privateState;
      privateState=hidden.next[previous][symbol];
      return hidden.output[previous][symbol];
    }
  };
  const result=await learnBoundedStepOnly(api,4,128);
  assert.equal(result.certified,true);
  assert.ok(result.clone);
  const actual={...hidden,state:privateState};
  assert.equal(equivalentFromStates(result.clone,actual),false);
  const witness=distinguish(result.clone,actual);
  assert.ok(witness);
  assert.equal(witness.length,5);
  assert.ok(witness.every(symbol=>symbol===0));
});

test('query limits retain uncertainty and invalid output contracts fail explicitly',async()=>{
  const machine=makeIndependentMachine(0xdeadbeef,3);
  const short=await evaluate(machine,3,1);
  assert.equal(short.certified,false);
  assert.equal(short.clone,null);
  await assert.rejects(()=>learnBoundedStepOnly({async step(){return 2;}},2,3),/binary output/);
  await assert.rejects(()=>learnBoundedStepOnly({async step(){return 0;}},5,3),/maxStates/);
});

test('an understated state bound can certify a false clone and must not be trusted',async()=>{
  const privateModel=makeIndependentMachine(1,3);
  let privateState=0;
  const publicApi={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      const old=privateState;
      privateState=privateModel.next[old][symbol];
      return privateModel.output[old][symbol];
    }
  };
  const result=await learnBoundedStepOnly(publicApi,2,64);
  assert.equal(result.certified,true);
  assert.equal(result.queries,8);
  assert.ok(result.clone);
  assert.deepEqual(distinguish(result.clone,{...privateModel,state:privateState}),[0]);
});

test('certified continuation runs as a stand-alone stateful offline clone',async()=>{
  const model=makeIndependentMachine(0x31415926,3);
  let privateState=0;
  const publicStep={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      const previous=privateState;
      privateState=model.next[previous][symbol];
      return model.output[previous][symbol];
    }
  };
  const found=await learnBoundedStepOnly(publicStep,3,64);
  assert.equal(found.certified,true);
  assert.ok(found.clone);
  const clone=createContinuationClone(found.clone);
  const followup=[1,0,1,1,0,0,0,1,1,0,1,0,0,1,1,1,0];
  /** @type {number[]} */
  const actual=[];
  for(const symbol of followup)actual.push(await publicStep.step(symbol));
  assert.deepEqual(followup.map(symbol=>clone.step(symbol)),actual);
  assert.throws(()=>clone.step(2),RangeError);
});
