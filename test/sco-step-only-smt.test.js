'use strict';

const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {buildStepOnlySmtQuery,buildFixedReferenceStepOnlySmtQuery}=require('../sims/sco-step-only-smt');

test('single-model query admits binary transcripts with a finite state bound',()=>{
  const query=buildStepOnlySmtQuery({maxStates:1,inputs:[0,1],outputs:[0,1]},'single');
  assert.match(query.smt2,/\(assert \(= \(A_output A_q_1 true\) true\)\)/);
  assert.match(query.smt2,/\(assert \(= A_q_2 \(A_delta A_q_1 true\)\)\)/);
  assert.equal(query.horizon,0);
  assert.equal(query.futureInputNames.length,0);
  assert.ok(!query.smt2.includes('(declare-const B_d_0_0'));
  assert.ok(query.valuesCommand.includes('A_q_2'));
});

test('pair query considers full product horizon and both current states',()=>{
  const query=buildStepOnlySmtQuery({maxStates:3,inputs:[0,1,0],outputs:[1,0,0]});
  assert.equal(query.horizon,9);
  assert.equal(query.futureInputNames.length,9);
  assert.match(query.smt2,/\(assert \(= B_p_0 B_q_3\)\)/);
  assert.match(query.smt2,/\(assert \(= A_p_9 \(A_delta A_p_8 future_8\)\)\)/);
  assert.ok(query.smt2.includes('(not (= (A_output A_p_8 future_8) (B_output B_p_8 future_8)))'));
  assert.equal(query.modelNames.length,3*2*4+2+9);
});

test('malformed transcripts and oversized bounds fail before building a solver query',()=>{
  for(const request of [
    {maxStates:0,inputs:[],outputs:[]},
    {maxStates:9,inputs:[],outputs:[]},
    {maxStates:2,inputs:[1],outputs:[]},
    {maxStates:2,inputs:[-1],outputs:[0]},
    {maxStates:2,inputs:[0],outputs:[true]},
    {maxStates:2,inputs:Array(257).fill(0),outputs:Array(257).fill(0)}
  ])assert.throws(()=>buildStepOnlySmtQuery(request),RangeError);
  // @ts-expect-error Deliberately exercise the runtime invalid-mode guard.
  assert.throws(()=>buildStepOnlySmtQuery({maxStates:1,inputs:[],outputs:[]},'wrong'),RangeError);
});

// Optional executable solver check. Ordinary project CI has no Z3 dependency.
const z3Probe=spawnSync('z3',['-in'],{input:'(check-sat)\n',encoding:'utf8',timeout:2000});
const hasZ3=!z3Probe.error&&z3Probe.status===0;
test('Z3 corroborates satisfiable, inequivalent, and inconsistent bounds when installed',
  {skip:!hasZ3},()=>{
    /** @type {Array<[{maxStates:number,inputs:number[],outputs:number[]},'single'|'pair','sat'|'unsat']>} */
    const cases=[
      [{maxStates:1,inputs:[0,1],outputs:[0,1]},'single','sat'],
      [{maxStates:1,inputs:[0,1],outputs:[0,1]},'pair','unsat'],
      [{maxStates:1,inputs:[0,0],outputs:[0,1]},'single','unsat'],
      [{maxStates:2,inputs:[0],outputs:[0]},'pair','sat']
    ];
    for(const [request,kind,expected] of cases){
      const query=buildStepOnlySmtQuery(request,kind);
      const result=spawnSync('z3',['-in'],{input:query.smt2,encoding:'utf8',timeout:10000});
      assert.equal(result.status,0,result.stderr);
      assert.equal(result.stdout.trim(),expected);
    }
  });


test('fixed reference removes symbolic A tables and rejects transcript-inconsistent models',()=>{
  const request={maxStates:3,inputs:[0],outputs:[0]};
  const reference={next:[[1,1],[0,0]],output:[[0,0],[1,1]],state:1};
  const query=buildFixedReferenceStepOnlySmtQuery(request,reference);
  assert.equal(query.horizon,6);
  assert.equal(query.fullHorizon,6);
  assert.equal(query.complete,true);
  assert.match(query.smt2,/\(assert \(= A_p_0 1\)\)/);
  assert.ok(!query.smt2.includes('declare-const A_d_0_0'));
  assert.ok(query.smt2.includes('(declare-const B_d_0_0 Int)'));
  assert.equal(query.modelNames.length,3*4+1+6);
  assert.throws(()=>buildFixedReferenceStepOnlySmtQuery(request,{...reference,state:0}),RangeError);
  assert.throws(()=>buildFixedReferenceStepOnlySmtQuery(request,{...reference,output:[[1,0],[1,1]]}),RangeError);
  assert.throws(()=>buildFixedReferenceStepOnlySmtQuery(request,{...reference,next:[[4,1],[0,0]]}),RangeError);
  const shallow=buildFixedReferenceStepOnlySmtQuery(request,reference,2);
  assert.equal(shallow.horizon,2);
  assert.equal(shallow.fullHorizon,6);
  assert.equal(shallow.complete,false);
  assert.ok(!shallow.smt2.includes('future_2'));
  assert.throws(()=>buildFixedReferenceStepOnlySmtQuery(request,reference,0),RangeError);
  assert.throws(()=>buildFixedReferenceStepOnlySmtQuery(request,reference,7),RangeError);
});

test('Z3 checks fixed-reference indistinguishability when installed',
  {skip:!hasZ3},()=>{
    const query=buildFixedReferenceStepOnlySmtQuery(
      {maxStates:1,inputs:[0,1],outputs:[0,1]},
      {next:[[0,0]],output:[[0,1]],state:0});
    const result=spawnSync('z3',['-in'],{input:query.smt2,encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'unsat');
  });
