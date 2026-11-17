'use strict';

const assert=require('node:assert/strict');
const {hrtime}=require('node:process');
const {createScoCapabilityScope,createScoPrivateHandles}=
  require('../src/sco-capabilities');
const {makeMachine}=require('./sco-stateful-oracle');

/** @typedef {{state:number}} StateRecord */
/** @typedef {'native'|'per-step'|'per-session'} Mode */
/** @typedef {{mode:Mode,elapsedMs:number,checksum:number}} Sample */

const machine=makeMachine(0x731ab42d);
const scope=createScoCapabilityScope(()=> 'verified-A');
const handles=createScoPrivateHandles(scope.currentPrincipal);
const request=/** @type {import('node:http').IncomingMessage} */ (
  /** @type {unknown} */ ({headers:{}}));
const modes=/** @type {Mode[]} */ (['native','per-step','per-session']);

/** @param {StateRecord} record @param {number} symbol @returns {number} */
function step(record,symbol){
  const old=record.state;
  record.state=machine.next[old][symbol];
  return machine.output[old][symbol];
}

/** @param {number} count @returns {Uint8Array} */
function inputs(count){
  const symbols=new Uint8Array(count);
  let seed=0x637aa125;
  for(let index=0;index<count;index++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    symbols[index]=(seed>>>16)&1;
  }
  return symbols;
}

/**
 * Compare the same server-side state machine under ordinary direct dispatch,
 * a capability lookup+callback for each elementary step, and a single
 * capability callback that executes the whole session. Authentication, queue
 * admission, handle mint and revoke happen outside each timed hot section.
 *
 * @param {Mode} mode
 * @param {Uint8Array} symbols
 * @returns {Promise<Sample>}
 */
async function sample(mode,symbols){
  let elapsedMs=0;
  let checksum=0;
  await scope.runRpcIsolated(request,async()=>{
    const state=/** @type {StateRecord} */ ({state:0});
    const token=mode==='native'?'':handles.issue(state);
    const start=hrtime.bigint();
    if(mode==='native'){
      for(const symbol of symbols)checksum+=step(state,symbol);
    }else if(mode==='per-step'){
      for(const symbol of symbols){
        checksum+=handles.use(token,record=>
          step(/** @type {StateRecord} */ (record),symbol));
      }
    }else{
      checksum=handles.use(token,record=>{
        let sum=0;
        const state=/** @type {StateRecord} */ (record);
        for(const symbol of symbols)sum+=step(state,symbol);
        return sum;
      });
    }
    elapsedMs=Number(hrtime.bigint()-start)/1e6;
    if(token)assert.equal(handles.revoke(token),true);
  });
  assert.ok(elapsedMs>0);
  return {mode,elapsedMs,checksum};
}

/**
 * Benchmarks are deliberately descriptive, not hypothesis tests. Per-trial
 * method order rotates to expose warmup/order sensitivity. Native work is
 * executed in the same authenticated request context for a fair isolation
 * boundary; timed regions exclude both sides' request admission.
 *
 * @param {number} [repeats]
 * @returns {Promise<{records:Record<string,unknown>[],summary:Record<string,unknown>[]}>}
 */
async function run(repeats=6){
  assert.ok(Number.isSafeInteger(repeats)&&repeats>=1&&repeats<=12);
  const warming=inputs(30000);
  for(const mode of modes)await sample(mode,warming);
  /** @type {Record<string,unknown>[]} */const records=[];
  /** @type {Record<string,unknown>[]} */const summary=[];
  for(const count of [200000,1000000]){
    const symbols=inputs(count);
    let stepOverBudget=0,sessionOverBudget=0;
    let stepMax=0,sessionMax=0;
    for(let trial=0;trial<repeats;trial++){
      const order=/** @type {Mode[]} */ (
        [modes[trial%3],modes[(trial+1)%3],modes[(trial+2)%3]]);
      /** @type {Partial<Record<Mode,Sample>>} */const outcomes={};
      for(const mode of order)outcomes[mode]=await sample(mode,symbols);
      const native=/** @type {Sample} */ (outcomes.native);
      const perStep=/** @type {Sample} */ (outcomes['per-step']);
      const perSession=/** @type {Sample} */ (outcomes['per-session']);
      assert.equal(native.checksum,perStep.checksum);
      assert.equal(native.checksum,perSession.checksum);
      const perStepRatio=perStep.elapsedMs/native.elapsedMs;
      const perSessionRatio=perSession.elapsedMs/native.elapsedMs;
      if(perStepRatio>2.5)stepOverBudget++;
      if(perSessionRatio>2.5)sessionOverBudget++;
      stepMax=Math.max(stepMax,perStepRatio);
      sessionMax=Math.max(sessionMax,perSessionRatio);
      const record={count,trial,order,
        nativeMs:native.elapsedMs,
        perStepMs:perStep.elapsedMs,
        perSessionMs:perSession.elapsedMs,
        perStepRatio,perSessionRatio,checksum:native.checksum};
      records.push(record);
      console.log(JSON.stringify(record));
    }
    const result={count,repeats,stepOverBudget,sessionOverBudget,
      stepMaxRatio:stepMax,sessionMaxRatio:sessionMax};
    summary.push(result);
    console.log(JSON.stringify({summary:result}));
  }
  return {records,summary};
}

if(require.main===module){
  run().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={run,inputs,step,sample};
