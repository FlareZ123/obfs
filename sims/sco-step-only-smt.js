'use strict';

/** @typedef {0|1} Bit */
/** @typedef {{maxStates:number,inputs:readonly number[],outputs:readonly number[]}} SmtTranscript */
/** @typedef {{smt2:string,valuesCommand:string,modelNames:string[],futureInputNames:string[],horizon:number}} SmtQuery */

/**
 * Verify the bounded deterministic binary Mealy-machine experiment's premises.
 * A time-dependent or multi-client-mutated oracle is outside this model.
 * @param {SmtTranscript} request
 */
function validate(request){
  if(!request||!Number.isSafeInteger(request.maxStates)||request.maxStates<1||request.maxStates>8){
    throw new RangeError('maxStates must be 1..8');
  }
  if(!Array.isArray(request.inputs)||!Array.isArray(request.outputs)||
     request.inputs.length!==request.outputs.length||request.inputs.length>256){
    throw new RangeError('inputs and outputs must be equally sized arrays of at most 256 bits');
  }
  for(const value of [...request.inputs,...request.outputs]){
    if(value!==0&&value!==1)throw new RangeError('Transcript elements must be binary');
  }
}

/** @param {string} name @param {'Int'|'Bool'} sort */
function declare(name,sort){return `(declare-const ${name} ${sort})`;}

/** @param {string} name @param {readonly string[]} args */
function foldIte(name,args){
  let expression=args[args.length-1];
  for(let i=args.length-2;i>=0;i--){
    expression=`(ite (= ${name} ${i}) ${args[i]} ${expression})`;
  }
  return expression;
}

/**
 * Model one complete N-state transition table with Boolean output bits.
 * The active path starts at state 0. Unreachable padding is intentional.
 * @param {'A'|'B'} prefix
 * @param {number} states
 * @param {string[]} lines
 * @param {string[]} values
 */
function declareMachine(prefix,states,lines,values){
  /** @type {string[]} */
  const deltas=[];
  /** @type {string[]} */
  const outputs=[];
  for(let state=0;state<states;state++){
    const d0=`${prefix}_d_${state}_0`,d1=`${prefix}_d_${state}_1`;
    const o0=`${prefix}_o_${state}_0`,o1=`${prefix}_o_${state}_1`;
    lines.push(declare(d0,'Int'),declare(d1,'Int'),declare(o0,'Bool'),declare(o1,'Bool'));
    for(const name of [d0,d1])lines.push(`(assert (and (<= 0 ${name}) (< ${name} ${states})))`);
    values.push(d0,d1,o0,o1);
    deltas.push(`(ite symbol ${d1} ${d0})`);
    outputs.push(`(ite symbol ${o1} ${o0})`);
  }
  lines.push(`(define-fun ${prefix}_delta ((state Int) (symbol Bool)) Int ${foldIte('state',deltas)})`);
  lines.push(`(define-fun ${prefix}_output ((state Int) (symbol Bool)) Bool ${foldIte('state',outputs)})`);
}

/**
 * Require a machine to reproduce the entire one-stream transcript.
 * @param {'A'|'B'} prefix
 * @param {readonly number[]} inputs
 * @param {readonly number[]} outputs
 * @param {string[]} lines
 * @param {string[]} values
 */
function constrainTranscript(prefix,inputs,outputs,lines,values){
  for(let t=0;t<=inputs.length;t++){
    const name=`${prefix}_q_${t}`;
    lines.push(declare(name,'Int'));
  }
  lines.push(`(assert (= ${prefix}_q_0 0))`);
  for(let t=0;t<inputs.length;t++){
    const bit=inputs[t]===1?'true':'false';
    const out=outputs[t]===1?'true':'false';
    lines.push(`(assert (= (${prefix}_output ${prefix}_q_${t} ${bit}) ${out}))`);
    lines.push(`(assert (= ${prefix}_q_${t+1} (${prefix}_delta ${prefix}_q_${t} ${bit})))`);
  }
  values.push(`${prefix}_q_${inputs.length}`);
}

/**
 * Construct an SMT-LIB2 query over exact binary deterministic Mealy machines
 * with at most N states. A single-model query checks transcript consistency.
 * A pair query checks whether two consistent continuations differ on any
 * future word, bounded completely by N² product states.
 *
 * The emitted text is solver-neutral SMT-LIB2 with no network interactions.
 * Apply `valuesCommand` only if a separate `(check-sat)` result is `sat`.
 * `unsat` for the pair is a conditional equivalence certificate *only* if
 * the single-model query is also `sat` under the declared state bound.
 *
 * @param {SmtTranscript} request
 * @param {'single'|'pair'} [kind]
 * @returns {SmtQuery}
 */
function buildStepOnlySmtQuery(request,kind='pair'){
  validate(request);
  if(kind!=='single'&&kind!=='pair')throw new RangeError('kind must be single or pair');
  const {maxStates,inputs,outputs}=request;
  /** @type {string[]} */
  const lines=['(set-logic QF_LIA)','(set-option :produce-models true)'];
  /** @type {string[]} */
  const names=[];
  declareMachine('A',maxStates,lines,names);
  constrainTranscript('A',inputs,outputs,lines,names);
  const horizon=kind==='pair'?maxStates*maxStates:0;
  /** @type {string[]} */
  const futureInputNames=[];
  if(kind==='pair'){
    declareMachine('B',maxStates,lines,names);
    constrainTranscript('B',inputs,outputs,lines,names);
    /** @type {string[]} */
    const differences=[];
    for(let i=0;i<horizon;i++){
      const x=`future_${i}`;
      lines.push(declare(x,'Bool'));
      futureInputNames.push(x);
      differences.push(`(not (= (A_output A_p_${i} ${x}) (B_output B_p_${i} ${x})))`);
    }
    for(const prefix of ['A','B']){
      for(let i=0;i<=horizon;i++)lines.push(declare(`${prefix}_p_${i}`,'Int'));
      lines.push(`(assert (= ${prefix}_p_0 ${prefix}_q_${inputs.length}))`);
      for(let i=0;i<horizon;i++){
        lines.push(`(assert (= ${prefix}_p_${i+1} (${prefix}_delta ${prefix}_p_${i} future_${i})))`);
      }
    }
    lines.push(`(assert (or ${differences.join(' ')}))`);
  }
  lines.push('(check-sat)');
  names.push(...futureInputNames);
  return {
    smt2:lines.join('\n')+'\n',
    valuesCommand:`(get-value (${names.join(' ')}))\n`,
    modelNames:names,
    futureInputNames,
    horizon
  };
}


/** @typedef {{next:number[][],output:number[][],state:number}} FixedReference */

/**
 * Check a supplied representative against the original continuous transcript,
 * including its final active state. A different initial state is not allowed.
 * @param {SmtTranscript} request
 * @param {FixedReference} model
 * @returns {number} Number of states in the reference model
 */
function validateReference(request,model){
  const states=model?.next?.length;
  if(!Number.isSafeInteger(states)||states<1||states>request.maxStates||
     !Array.isArray(model.output)||model.output.length!==states){
    throw new RangeError('reference must have 1..maxStates complete state rows');
  }
  for(let state=0;state<states;state++){
    const d=model.next[state],o=model.output[state];
    if(!Array.isArray(d)||d.length!==2||!Array.isArray(o)||o.length!==2){
      throw new RangeError('reference rows must have two input entries');
    }
    for(const successor of d){
      if(!Number.isSafeInteger(successor)||successor<0||successor>=states){
        throw new RangeError('reference transition leaves declared state space');
      }
    }
    for(const observed of o){
      if(observed!==0&&observed!==1)throw new RangeError('reference outputs must be binary');
    }
  }
  let current=0;
  for(let t=0;t<request.inputs.length;t++){
    const input=request.inputs[t];
    if(model.output[current][input]!==request.outputs[t]){
      throw new RangeError('reference does not reproduce transcript');
    }
    current=model.next[current][input];
  }
  if(model.state!==current){
    throw new RangeError('reference current state differs from transcript replay');
  }
  return states;
}

/**
 * Declare an immutable reference model, with its table encoded directly as
 * constant expressions, removing all A model variables from the SMT search.
 * @param {FixedReference} model
 * @param {string[]} lines
 */
function defineFixedReference(model,lines){
  const deltas=[];
  const outputs=[];
  for(let state=0;state<model.next.length;state++){
    const d=model.next[state],o=model.output[state];
    deltas.push(`(ite symbol ${d[1]} ${d[0]})`);
    outputs.push(`(ite symbol ${o[1]===1?'true':'false'} ${o[0]===1?'true':'false'})`);
  }
  lines.push(`(define-fun A_delta ((state Int) (symbol Bool)) Int ${foldIte('state',deltas)})`);
  lines.push(`(define-fun A_output ((state Int) (symbol Bool)) Bool ${foldIte('state',outputs)})`);
}

/**
 * Fix one transcript-consistent reference A and search only for an alternative B.
 * A counterexample exists iff two arbitrary transcript-consistent models are
 * behaviorally inequivalent: if any pair differs, one member differs from A.
 *
 * An UNSAT result implies equivalence to A only under the independently trusted
 * state bound and when the validated reference is genuinely transcript-consistent.
 * The complete product horizon is |A|*maxStates. An optional shorter horizon
 * supports *bounded depth* SAT queries only: a shortened UNSAT result is not
 * an equivalence certificate. Inspect `complete` before using UNSAT as a verdict.
 * Only `sat` justifies executing valuesCommand.
 *
 * @param {SmtTranscript} request
 * @param {FixedReference} reference
 * @param {number} [horizonLimit] Optional positive maximum future-word length
 * @returns {SmtQuery & {complete:boolean,fullHorizon:number}}
 */
function buildFixedReferenceStepOnlySmtQuery(request,reference,horizonLimit){
  validate(request);
  const referenceStates=validateReference(request,reference);
  const {maxStates,inputs,outputs}=request;
  /** @type {string[]} */
  const lines=['(set-logic QF_LIA)','(set-option :produce-models true)'];
  /** @type {string[]} */
  const names=[];
  defineFixedReference(reference,lines);
  declareMachine('B',maxStates,lines,names);
  constrainTranscript('B',inputs,outputs,lines,names);
  const fullHorizon=referenceStates*maxStates;
  const horizon=horizonLimit===undefined?fullHorizon:horizonLimit;
  if(!Number.isSafeInteger(horizon)||horizon<1||horizon>fullHorizon){
    throw new RangeError('horizonLimit must be 1..fullHorizon');
  }
  /** @type {string[]} */
  const futureInputNames=[];
  /** @type {string[]} */
  const differences=[];
  for(let i=0;i<horizon;i++){
    const x=`future_${i}`;
    lines.push(declare(x,'Bool'));
    futureInputNames.push(x);
    differences.push(`(not (= (A_output A_p_${i} ${x}) (B_output B_p_${i} ${x})))`);
  }
  for(const prefix of ['A','B']){
    for(let i=0;i<=horizon;i++)lines.push(declare(`${prefix}_p_${i}`,'Int'));
    lines.push(`(assert (= ${prefix}_p_0 ${prefix==='A'?reference.state:`B_q_${inputs.length}`}))`);
    for(let i=0;i<horizon;i++){
      lines.push(`(assert (= ${prefix}_p_${i+1} (${prefix}_delta ${prefix}_p_${i} future_${i})))`);
    }
  }
  lines.push(`(assert (or ${differences.join(' ')}))`);
  lines.push('(check-sat)');
  names.push(...futureInputNames);
  return {smt2:lines.join('\n')+'\n',valuesCommand:`(get-value (${names.join(' ')}))\n`,
    modelNames:names,futureInputNames,horizon,fullHorizon,complete:horizon===fullHorizon};
}

module.exports={buildStepOnlySmtQuery,buildFixedReferenceStepOnlySmtQuery};

