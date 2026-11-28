'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPolicy,learn,learnExpected,continuation,equivalent}=
  require('../sims/sco-two-state-optimal-network-policy');
const {runProcessBoundary}=require('../sims/sco-two-state-process-boundary');

test('complete independent two-state policy has an exact nine-request certificate',async()=>{
  const policy=createPolicy();
  assert.equal(policy.models.length,260);
  assert.equal(policy.beliefs.length,4429);
  assert.equal(policy.ranks[0],9);
  assert.ok(policy.ranks.every(rank=>rank>=0&&rank<=9));
  // Global minimax lower-bound certificate: regardless of the attacker's
  // chosen input, some output branch retains at least rank-1 calls of
  // uncertainty. Its nonempty belief contains an actual source model.
  let finiteNonterminal=0;
  for(let belief=0;belief<policy.beliefs.length;belief++){
    const rank=policy.ranks[belief];
    if(rank===0)continue;
    finiteNonterminal++;
    for(let input=0;input<2;input++){
      const branches=policy.transitions[belief][input]
        .filter(next=>next>=0).map(next=>policy.ranks[next]);
      assert.ok(branches.length>0);
      assert.ok(Math.max(...branches)>=rank-1);
    }
  }
  assert.ok(finiteNonterminal>4000);
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
  // Independent finite-horizon weighted policy minimizes the aggregate
  // authorized calls over the uniform labelled-source prior under a strict
  // worst-case bound of nine calls.
  assert.equal(policy.rootWeightedCalls,1884);
  let total=0;
  /** @type {Record<number,number>} */
  const histogram={};
  for(const model of policy.models){
    let state=0;
    const learned=await learnExpected({step:async input=>{
      const output=model.output[state][input];
      state=model.next[state][input];
      return output;
    }},policy);
    total+=learned.queries;
    histogram[learned.queries]=(histogram[learned.queries]||0)+1;
    assert.ok(learned.queries<=9);
    assert.equal(equivalent([learned.clone,model],learned.currentState,2+state),true);
  }
  assert.equal(total,1884);
  assert.deepEqual(histogram,{6:40,7:156,8:24,9:40});
});

test('authenticated real SCO and equal-trust ordinary RPC clients are cloned from another Node process',async()=>{
  const result=await runProcessBoundary();
  assert.equal(result.exact,true);
  assert.equal(result.matchedControl,true);
  assert.equal(result.wireMatched,true);
  assert.equal(result.wireCalls,result.traceLength);
  assert.equal(result.rank,9);
  assert.equal(result.beliefs,4429);
  assert.ok(result.queries>=0&&result.queries<=9);
  assert.ok(Number.isInteger(result.modelId)&&result.modelId>=0&&result.modelId<260);
  assert.equal(result.traceLength,result.queries+16);
  assert.equal(result.unauthorizedSco,403);
  assert.equal(result.unauthorizedOrdinary,403);
  assert.equal(result.publicServerPrivateCanary,false);
  assert.ok(result.scoBytes>0&&result.ordinaryBytes>0);
  assert.ok(result.attackerPid>0&&result.serverPid>0);
  assert.notEqual(result.attackerPid,result.serverPid);
});

test('Linux runner-owned server denies signals from different-UID public client',
  {skip:process.platform!=='linux'||process.env.OBFS_SCO_UID_TEST!=='1'},async()=>{
    const result=await runProcessBoundary(true);
    assert.notEqual(result.serverUid,65534);
    assert.equal(result.attackerUid,65534);
    assert.equal(result.signalPermissionDenied,true);
    assert.equal(result.exact,true);
    assert.equal(result.matchedControl,true);
  assert.equal(result.wireMatched,true);
  assert.equal(result.wireCalls,result.traceLength);
    assert.ok(result.queries<=9);
  });

test('wire observer catches semantic-invisible ordinary JSON response extension',async()=>{
  await assert.rejects(()=>runProcessBoundary(false,true),
    /Wire transcript mismatch after semantic parity/);
});

test('predeclared 16 real SCO private tables cover all four optimal public-query depths',async()=>{
  // The evaluator transmits each table index to the trusted server over a
  // private IPC handshake. No index is passed to the public attacker.
  const cases=[
    [45,6],[48,6],[49,6],[60,6],
    [0,7],[1,7],[2,7],[3,7],
    [7,8],[13,8],[17,8],[22,8],
    [10,9],[11,9],[16,9],[18,9]
  ];
  for(const [id,expectedQueries] of cases){
    const result=await runProcessBoundary(false,false,id);
    assert.equal(result.modelId,id);
    assert.equal(result.queries,expectedQueries);
    assert.equal(result.exact,true);
    assert.equal(result.wireMatched,true);
    assert.equal(result.wireCalls,result.queries+16);
    assert.equal(result.unauthorizedSco,403);
    assert.equal(result.unauthorizedOrdinary,403);
  }
});

test('three-state model falsifies any unconditional two-state clone certificate',async()=>{
  // Explicit smallest-ID witness from exhaustive labelled three-state
  // enumeration (base-6 table index 52). The learner is not told that its
  // assumed upper bound is false, and must not be described as universally
  // sound on arbitrary SCO services.
  const model={
    next:[[2,1],[0,0],[0,0]],
    output:[[0,0],[1,0],[0,0]]
  };
  const policy=createPolicy();
  let state=0;
  const learned=await learnExpected({step:async input=>{
    const output=model.output[state][input];
    state=model.next[state][input];
    return output;
  }},policy);
  assert.equal(learned.queries,7);
  assert.deepEqual(learned.inputs,[0,1,0,1,1,0,0]);
  assert.deepEqual(learned.outputs,[0,0,0,0,0,1,0]);
  assert.equal(state,2);
  assert.equal(learned.currentState,1);
  assert.equal(equivalent([learned.clone,model],learned.currentState,2+state),false);
  assert.deepEqual(continuation(learned.clone,learned.currentState,[0]).outputs,[1]);
  assert.deepEqual(continuation(model,state,[0]).outputs,[0]);
});
