'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPolicy,learn,continuation,equivalent}=
  require('../sims/sco-two-state-optimal-network-policy');
const {runProcessBoundary}=require('../sims/sco-two-state-process-boundary');

test('complete independent two-state policy has an exact nine-request certificate',async()=>{
  const policy=createPolicy();
  assert.equal(policy.models.length,260);
  assert.equal(policy.beliefs.length,4501);
  assert.equal(policy.ranks[0],9);
  assert.ok(policy.ranks.every(rank=>rank>=0&&rank<=9));
  let worst=0;
  for(const model of policy.models){
    let realState=0;
    const learned=await learn({step:async input=>{
      const output=model.output[realState][input];
      realState=model.next[realState][input];
      return output;
    }},policy);
    worst=Math.max(worst,learned.queries);
    assert.ok(learned.queries<=9);
    assert.equal(learned.rankTrace[0],9);
    assert.equal(learned.rankTrace.at(-1),0);
    assert.ok(learned.rankTrace.every((rank,index)=>
      index===0||rank<learned.rankTrace[index-1]));
    assert.equal(equivalent([learned.clone,model],learned.currentState,2+realState),true);
    const followup=[0,1,0,0,1,1,0,1,1,1];
    const predicted=continuation(learned.clone,learned.currentState,followup).outputs;
    const actual=continuation(model,realState,followup).outputs;
    assert.deepEqual(predicted,actual);
  }
  assert.equal(worst,9);
});

test('authenticated real SCO and equal-trust ordinary RPC clients are cloned from another Node process',async()=>{
  const result=await runProcessBoundary();
  assert.equal(result.exact,true);
  assert.equal(result.matchedControl,true);
  assert.equal(result.rank,9);
  assert.equal(result.beliefs,4501);
  assert.ok(result.queries>=0&&result.queries<=9);
  assert.equal(result.traceLength,result.queries+16);
  assert.equal(result.unauthorizedSco,403);
  assert.equal(result.unauthorizedOrdinary,403);
  assert.equal(result.publicServerPrivateCanary,false);
  assert.ok(result.scoBytes>0&&result.ordinaryBytes>0);
  assert.ok(result.attackerPid>0&&result.serverPid>0);
  assert.notEqual(result.attackerPid,result.serverPid);
});
