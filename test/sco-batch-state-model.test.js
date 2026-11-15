'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preflightScoBatchState}=require('../src');

/**
 * A two-state policy used as a finite reference model. Reading and revoking
 * require an active session; revocation changes all later permissions.
 * @type {{
 *   authorize:(active:boolean,method:string,args:unknown[])=>boolean,
 *   transition:(active:boolean,method:string,args:unknown[])=>boolean
 * }}
 */
const policy={
  authorize:(active,method,args)=>active &&
    (method==='read'||method==='revoke') && args.length===0,
  transition:(active,method)=>method==='revoke'?false:active
};

/** @param {string[]} names @returns {{method:string,args:unknown[]}[]} */
function calls(names) {
  return names.map(method=>({method,args:[]}));
}

/**
 * The reference evaluator applies authorization immediately before each
 * modeled operation. Neither it nor the preflight helper executes real work.
 * @param {string[]} names
 * @returns {boolean}
 */
function sequentiallyAllowed(names) {
  let active=true;
  for(const method of names) {
    if(!policy.authorize(active,method,[]))return false;
    active=policy.transition(active,method,[]);
  }
  return true;
}

test('pure batch-state preflight matches sequential permission semantics for 510 traces',()=>{
  let cases=0;
  let unsafeSnapshotAccepted=0;
  let permitted=0;
  for(let length=1;length<=8;length++) {
    for(let mask=0;mask<(1<<length);mask++) {
      /** @type {string[]} */
      const names=[];
      for(let bit=0;bit<length;bit++)names.push(mask&(1<<bit)?'revoke':'read');
      const expected=sequentiallyAllowed(names);
      const actual=preflightScoBatchState(calls(names),true,policy);
      assert.equal(actual,expected,names.join(','));
      // A preflight that checks all calls against the *same* initial state
      // accepts all 510 traces even when a preceding call revoked access.
      if(!expected)unsafeSnapshotAccepted++;
      if(actual)permitted++;
      cases++;
    }
  }
  assert.equal(cases,510);
  assert.equal(permitted,16);
  assert.equal(unsafeSnapshotAccepted,494);
});

test('the stateful policy rejects revoke-then-read but admits read-then-revoke',()=>{
  assert.equal(preflightScoBatchState(calls(['revoke','read']),true,policy),false);
  assert.equal(preflightScoBatchState(calls(['read','revoke']),true,policy),true);
  assert.equal(preflightScoBatchState(calls(['read','read']),true,policy),true);
  assert.equal(preflightScoBatchState(calls(['read']),false,policy),false);
  assert.equal(preflightScoBatchState(calls(['renew']),true,policy),false);
});

test('the preflight rejects malformed batches and nonboolean async policy returns',()=>{
  assert.equal(preflightScoBatchState([],true,policy),false);
  assert.equal(preflightScoBatchState([{method:'read'}],true,policy),false);
  assert.equal(preflightScoBatchState([null],true,policy),false);
  assert.equal(preflightScoBatchState(calls(Array(1025).fill('read')),true,policy),false);
  assert.throws(()=>preflightScoBatchState(calls(['read']),true,{
    authorize:/** @type {any} */ (()=>Promise.resolve(true)),
    transition:policy.transition
  }),/synchronously/);
  assert.throws(()=>preflightScoBatchState(calls(['read']),true,
    /** @type {any} */ ({authorize:()=>true})),/transition functions/);
});
