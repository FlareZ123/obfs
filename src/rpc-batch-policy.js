'use strict';

const {types:{isPromise}}=require('node:util');

/**
 * @typedef {{method:string,args:unknown[]}} ScoBatchCall
 */

/**
 * A batch state transition is defined to be synchronous. A returned Promise
 * or another thenable can otherwise masquerade as a truthy next state.
 * @param {unknown} value
 * @returns {boolean}
 */
function isThenable(value) {
  return value!==null && (typeof value==='object'||typeof value==='function') &&
    typeof /** @type {{then?:unknown}} */ (value).then==='function';
}

/**
 * A mistakenly asynchronous policy can reject after the synchronous caller
 * has already thrown. Observe real Promise rejections across VM realms to
 * avoid a later unhandled process-level exception. Native isPromise avoids
 * invoking arbitrary non-Promise thenables.
 * This does not cancel asynchronous side effects already started by a policy.
 * @param {unknown} value
 * @returns {void}
 */
function consumeRejectedPromise(value) {
  if(isPromise(value))void Promise.prototype.then.call(value,undefined,()=>{});
}

/**
 * Evaluate the authorization of a complete batch against a *pure*, synchronous
 * application-supplied transition model before executing any operation.
 *
 * The caller must obtain an authoritative state snapshot, model every
 * permission-changing operation, and prevent concurrent state changes between
 * this check and execution (for example inside one application transaction).
 * This helper never executes the operations and cannot provide isolation.
 * It is intended for use in the outer batch branch of authorizeOperation.
 *
 * @template State
 * @param {unknown} calls
 * @param {State} initialState
 * @param {{
 *   authorize:(state:State,method:string,args:unknown[])=>boolean,
 *   transition:(state:State,method:string,args:unknown[])=>State
 * }} policy
 * @returns {boolean}
 */
function preflightScoBatchState(calls,initialState,policy) {
  if(!policy || typeof policy.authorize!=='function' ||
      typeof policy.transition!=='function') {
    throw new TypeError('Expected synchronous batch authorization and transition functions');
  }
  if(!Array.isArray(calls)||calls.length<1||calls.length>1024)return false;
  if(isThenable(initialState)) {
    consumeRejectedPromise(initialState);
    throw new TypeError('Batch initial state must be synchronous');
  }
  let state=initialState;
  for(const call of calls) {
    if(!call || typeof call!=='object' ||
        typeof call.method!=='string' || !Array.isArray(call.args))return false;
    const permitted=policy.authorize(state,call.method,call.args);
    if(typeof permitted!=='boolean') {
      consumeRejectedPromise(permitted);
      throw new TypeError('Batch state authorization must return a boolean synchronously');
    }
    if(!permitted)return false;
    state=policy.transition(state,call.method,call.args);
    if(isThenable(state)) {
      consumeRejectedPromise(state);
      throw new TypeError('Batch state transition must return synchronously');
    }
  }
  return true;
}

module.exports={preflightScoBatchState};
