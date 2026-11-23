'use strict';

// Exploratory benchmark only. The production five-state learner uses a
// packed active candidate-ID list. This prototype trades extra CPU for a
// smaller membership-bitset + per-candidate current-state representation.

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {FIVE_STATE_MODEL_COUNT,generateCanonicalTransitions}=
  require('../sims/sco-step-only-five-state');
const {makeIndependentMachine}=require('../sims/sco-sync-independent-distribution');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');

function createWorkspace(){
  const started=performance.now();
  const ranges=[];
  let offset=0;
  for(let states=1;states<=5;states++){
    const generated=generateCanonicalTransitions(states);
    const outputBits=2*states;
    const outputCount=1<<outputBits;
    const count=generated.count*outputCount;
    ranges.push({
      states,start:offset,end:offset+count,outputBits,
      outputMask:outputCount-1,transitions:generated.transitions
    });
    offset+=count;
  }
  assert.equal(offset,FIVE_STATE_MODEL_COUNT);
  const currentStates=new Uint8Array(offset);
  const membership=new Uint32Array(Math.ceil(offset/32));
  function reset(){
    currentStates.fill(0);
    membership.fill(0xffffffff);
    const remainder=offset&31;
    if(remainder)membership[membership.length-1]=(2**remainder-1)>>>0;
  }
  reset();
  return {
    currentStates,membership,ranges,modelCount:offset,reset,
    initializationMs:Number((performance.now()-started).toFixed(3)),
    candidateBytes:currentStates.byteLength+membership.byteLength
  };
}

function descriptor(id,state,ranges){
  for(const range of ranges){
    if(id<range.end){
      const local=id-range.start;
      const graphIndex=local>>>range.outputBits;
      return {
        range,graphOffset:graphIndex*2*range.states,
        outputMask:local&range.outputMask,state
      };
    }
  }
  throw new RangeError('Unknown model ID');
}

function firstDistinguishingSymbol(left,right,metrics){
  const start=left.state*5+right.state;
  const queue=new Uint8Array(25);
  const first=new Int8Array(25);
  first.fill(-1);
  let head=0,tail=0,seen=1<<start;
  queue[tail++]=start;
  while(head<tail){
    const pair=queue[head++];
    metrics.productPairs++;
    const leftState=Math.floor(pair/5);
    const rightState=pair%5;
    for(let symbol=0;symbol<2;symbol++){
      const leftPair=leftState*2+symbol;
      const rightPair=rightState*2+symbol;
      if(((left.outputMask>>>leftPair)&1)!==((right.outputMask>>>rightPair)&1)){
        return first[pair]===-1?symbol:first[pair];
      }
      const leftNext=left.range.transitions[left.graphOffset+leftPair];
      const rightNext=right.range.transitions[right.graphOffset+rightPair];
      const nextPair=leftNext*5+rightNext;
      const bit=1<<nextPair;
      if((seen&bit)===0){
        seen|=bit;
        first[nextPair]=first[pair]===-1?symbol:first[pair];
        queue[tail++]=nextPair;
      }
    }
  }
  return null;
}

function decodeCandidate(value){
  const {range,graphOffset,outputMask,state}=value;
  const next=Array.from({length:range.states},()=>[0,0]);
  const output=Array.from({length:range.states},()=>[0,0]);
  for(let source=0;source<range.states;source++)for(let symbol=0;symbol<2;symbol++){
    const pair=source*2+symbol;
    next[source][symbol]=range.transitions[graphOffset+pair];
    output[source][symbol]=(outputMask>>>pair)&1;
  }
  return {next,output,state};
}

async function learn(api,workspace,maxQueries=128){
  workspace.reset();
  const started=performance.now();
  const {currentStates,membership,ranges}=workspace;
  let count=workspace.modelCount;
  let queries=0,scanWork=0,equivalenceChecks=0,productPairs=0;
  const inputs=[],outputs=[];
  for(let query=0;query<=maxQueries;query++){
    let ones0=0,ones1=0,rangeIndex=0;
    for(let wordIndex=0;wordIndex<membership.length;wordIndex++){
      let mask=membership[wordIndex];
      while(mask){
        const lowbit=mask&-mask;
        const bit=31-Math.clz32(lowbit);
        const id=wordIndex*32+bit;
        while(id>=ranges[rangeIndex].end)rangeIndex++;
        const range=ranges[rangeIndex];
        const state=currentStates[id];
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        ones0+=(outputMask>>>(state*2))&1;
        ones1+=(outputMask>>>(state*2+1))&1;
        mask^=lowbit;
      }
    }
    scanWork+=count;
    const split0=Math.min(ones0,count-ones0);
    const split1=Math.min(ones1,count-ones1);
    let symbol=split0>=split1?0:1;
    if(Math.max(split0,split1)===0){
      let referenceId=-1;
      for(let wordIndex=0;wordIndex<membership.length&&referenceId<0;wordIndex++){
        const mask=membership[wordIndex];
        if(mask)referenceId=wordIndex*32+(31-Math.clz32(mask&-mask));
      }
      const reference=descriptor(referenceId,currentStates[referenceId],ranges);
      let witness=null;
      const metrics={productPairs:0};
      rangeIndex=0;
      for(let wordIndex=0;wordIndex<membership.length&&witness===null;wordIndex++){
        let mask=membership[wordIndex];
        while(mask){
          const lowbit=mask&-mask;
          const bit=31-Math.clz32(lowbit);
          const id=wordIndex*32+bit;
          mask^=lowbit;
          if(id===referenceId)continue;
          while(id>=ranges[rangeIndex].end)rangeIndex++;
          equivalenceChecks++;
          witness=firstDistinguishingSymbol(
            reference,descriptor(id,currentStates[id],ranges),metrics);
          if(witness!==null)break;
        }
      }
      productPairs+=metrics.productPairs;
      if(witness===null){
        return {
          certified:true,queries,remaining:count,inputs,outputs,
          clone:decodeCandidate(reference),scanWork,equivalenceChecks,productPairs,
          elapsedMs:Number((performance.now()-started).toFixed(3))
        };
      }
      symbol=witness;
    }
    if(query===maxQueries)break;
    const observed=await api.step(symbol);
    let kept=0;
    rangeIndex=0;
    for(let wordIndex=0;wordIndex<membership.length;wordIndex++){
      let mask=membership[wordIndex];
      while(mask){
        const lowbit=mask&-mask;
        const bit=31-Math.clz32(lowbit);
        const id=wordIndex*32+bit;
        while(id>=ranges[rangeIndex].end)rangeIndex++;
        const range=ranges[rangeIndex];
        const state=currentStates[id];
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        const pair=state*2+symbol;
        if(((outputMask>>>pair)&1)===observed){
          const graphIndex=local>>>range.outputBits;
          currentStates[id]=range.transitions[graphIndex*2*range.states+pair];
          kept++;
        }else{
          membership[wordIndex]&=~lowbit;
        }
        mask^=lowbit;
      }
    }
    scanWork+=count;
    if(kept===0)throw new Error('Oracle violates five-state model bound');
    count=kept;
    queries++;
    inputs.push(symbol);
    outputs.push(observed);
  }
  return {
    certified:false,queries,remaining:count,inputs,outputs,clone:null,
    scanWork,equivalenceChecks,productPairs,
    elapsedMs:Number((performance.now()-started).toFixed(3))
  };
}

function heldoutWords(seed,count){
  let random=seed>>>0;
  const words=[];
  for(let index=0;index<count;index++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%60);
    const word=[];
    for(let offset=0;offset<length;offset++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)&1);
    }
    words.push(word);
  }
  return words;
}

function traceFrom(model,word){
  let state=model.state;
  const outputs=[];
  for(const symbol of word){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}

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

async function main(){
  const workspace=createWorkspace();
  const fixtures=[
    {name:'random-five',model:makeIndependentMachine(0x42f5a7c9,5)},
    {name:'delayed-five',model:{
      next:[[1,0],[2,0],[3,0],[4,0],[4,0]],
      output:[[0,0],[0,0],[0,0],[1,0],[0,0]]
    }},
    {name:'padded-four',model:makeIndependentMachine(0x1f3a995b,4)}
  ];
  const records=[];
  for(let index=0;index<fixtures.length;index++){
    const fixture=fixtures[index];
    let privateState=0;
    const result=await learn({
      async step(symbol){
        const previous=privateState;
        privateState=fixture.model.next[previous][symbol];
        return fixture.model.output[previous][symbol];
      }
    },workspace);
    const hidden={...fixture.model,state:privateState};
    assert.equal(result.certified,true,fixture.name);
    assert.equal(equivalentFromStates(result.clone,hidden),true,fixture.name);
    for(const word of heldoutWords((0x7123abc1+Math.imul(index,10309))>>>0,128)){
      assert.deepEqual(traceFrom(result.clone,word),traceFrom(hidden,word));
    }
    records.push({
      name:fixture.name,queries:result.queries,remaining:result.remaining,
      scanWork:result.scanWork,equivalenceChecks:result.equivalenceChecks,
      productPairs:result.productPairs,learnerMs:result.elapsedMs
    });
  }
  process.stdout.write(JSON.stringify({
    representation:'Uint32Array membership bitset + Uint8Array current-state array',
    models:workspace.modelCount,
    membershipBytes:workspace.membership.byteLength,
    currentStateBytes:workspace.currentStates.byteLength,
    candidateBytes:workspace.candidateBytes,
    workspaceInitializationMs:workspace.initializationMs,
    heldoutSequences:fixtures.length*128,
    records
  })+'\n');
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
