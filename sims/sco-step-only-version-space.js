'use strict';

/** @typedef {{next:number[][],output:number[][],state:number}} Candidate */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */
/** @typedef {{certified:boolean,queries:number,remaining:number,inputs:number[],outputs:number[],clone:Candidate|null}} LearningResult */

/**
 * Exhaustively list binary Mealy machines with at most maxStates states.
 * Initial private state can be labeled zero without loss of generality.
 * The state-count cap is essential: at n=4 there are 16,777,216 labeled
 * machines before adding smaller classes and is impractical here.
 *
 * @param {number} maxStates
 * @returns {Candidate[]}
 */
function enumerateMachines(maxStates){
  if(!Number.isSafeInteger(maxStates)||maxStates<1||maxStates>3){
    throw new RangeError('maxStates must be 1..3');
  }
  /** @type {Candidate[]} */
  const candidates=[];
  for(let states=1;states<=maxStates;states++){
    const choices=2*states;
    const total=choices**(2*states);
    for(let id=0;id<total;id++){
      let digits=id;
      /** @type {number[][]} */
      const next=Array.from({length:states},()=>[0,0]);
      /** @type {number[][]} */
      const output=Array.from({length:states},()=>[0,0]);
      for(let state=0;state<states;state++)for(let symbol=0;symbol<2;symbol++){
        const option=digits%choices;
        digits=Math.floor(digits/choices);
        next[state][symbol]=Math.floor(option/2);
        output[state][symbol]=option%2;
      }
      candidates.push({next,output,state:0});
    }
  }
  return candidates;
}

/**
 * Exact BFS over the product of two finite models. If it returns null, the
 * models have identical output traces for every future input sequence from
 * the *current* states, despite potentially different private transition
 * tables. The product has at most n*m state pairs.
 *
 * @param {Candidate} left
 * @param {Candidate} right
 * @returns {number[]|null}
 */
function distinguish(left,right){
  const count=right.next.length;
  const seen=new Set([left.state*count+right.state]);
  const queue=[{a:left.state,b:right.state,word:/** @type {number[]} */([])}];
  for(let index=0;index<queue.length;index++){
    const current=queue[index];
    for(let symbol=0;symbol<2;symbol++){
      if(left.output[current.a][symbol]!==right.output[current.b][symbol]){
        return [...current.word,symbol];
      }
      const a=left.next[current.a][symbol];
      const b=right.next[current.b][symbol];
      const key=a*count+b;
      if(!seen.has(key)){
        seen.add(key);
        queue.push({a,b,word:[...current.word,symbol]});
      }
    }
  }
  return null;
}

/**
 * Choose a public query that splits the current version space when possible.
 * If immediate outputs are unanimous, follow a shortest distinguishing
 * continuation against the first inequivalent hypothesis. This strategy
 * can remain uncertain on one-way state spaces because no reset is exposed.
 *
 * @param {readonly Candidate[]} hypotheses
 * @returns {{symbol:number|null,certified:boolean}}
 */
function chooseSymbol(hypotheses){
  /** @type {number|null} */
  let bestSymbol=null;
  let bestSplit=0;
  for(let symbol=0;symbol<2;symbol++){
    let ones=0;
    for(const model of hypotheses)ones+=model.output[model.state][symbol];
    const split=Math.min(ones,hypotheses.length-ones);
    if(split>bestSplit){bestSplit=split;bestSymbol=symbol;}
  }
  if(bestSymbol!==null)return {symbol:bestSymbol,certified:false};
  const reference=hypotheses[0];
  for(let i=1;i<hypotheses.length;i++){
    const witness=distinguish(reference,hypotheses[i]);
    if(witness)return {symbol:witness[0],certified:false};
  }
  return {symbol:null,certified:true};
}

/**
 * Learn only from a legitimate public step-only operation, with no reset,
 * private transition access, or source extraction. Each surviving hypothesis
 * is a fully specified deterministic binary Mealy machine of <=maxStates
 * states, with its own current state advanced after each observed response.
 *
 * A positive certification is a rigorous *conditional continuation* result:
 * every model within the declared size bound consistent with the entire
 * observed transcript has identical behavior from its current state for
 * all future inputs. A false result is inconclusive and may be permanent.
 *
 * @param {StepOnlyOracle} api
 * @param {number} [maxStates]
 * @param {number} [maxQueries]
 * @returns {Promise<LearningResult>}
 */
async function learnBoundedStepOnly(api,maxStates=2,maxQueries=64){
  if(!Number.isSafeInteger(maxQueries)||maxQueries<1||maxQueries>512){
    throw new RangeError('maxQueries must be 1..512');
  }
  let hypotheses=enumerateMachines(maxStates);
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  for(let query=0;query<=maxQueries;query++){
    const choice=chooseSymbol(hypotheses);
    if(choice.certified){
      return {certified:true,queries:inputs.length,remaining:hypotheses.length,
        inputs,outputs,clone:hypotheses[0]};
    }
    if(query===maxQueries)break;
    const symbol=/** @type {number} */(choice.symbol);
    const observed=await api.step(symbol);
    if(observed!==0&&observed!==1){throw new RangeError('Expected binary output');}
    const next=[];
    for(const hypothesis of hypotheses){
      const state=hypothesis.state;
      if(hypothesis.output[state][symbol]===observed){
        hypothesis.state=hypothesis.next[state][symbol];
        next.push(hypothesis);
      }
    }
    if(next.length===0)throw new Error('Observed oracle violates declared finite-state bound');
    hypotheses=next;
    inputs.push(symbol);
    outputs.push(observed);
  }
  return {certified:false,queries:inputs.length,remaining:hypotheses.length,
    inputs,outputs,clone:null};
}

/**
 * Pure offline continuation for a certified representative model.
 * @param {Candidate} model
 * @param {readonly number[]} inputs
 * @returns {number[]}
 */
function predictContinuation(model,inputs){
  let state=model.state;
  /** @type {number[]} */
  const outputs=[];
  for(const symbol of inputs){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}

module.exports={enumerateMachines,distinguish,chooseSymbol,learnBoundedStepOnly,predictContinuation};
