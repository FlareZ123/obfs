'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenBranchBlocks}=require('../src');
const {recoverBranchFunction}=require('./branch-block-reconstruction');

/** @typedef {number|string|boolean|null|undefined|bigint|symbol} Input */
/** @typedef {{value?:unknown,error?:string}} Outcome */

/**
 * Small deterministic generator; each case has an independent seed and no
 * randomness from the wall clock. Used for reproducible held-out experiments.
 * @param {number} seed
 * @returns {()=>number}
 */
function generator(seed) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
}

const operations=['+','-','*','^','&','|','<<','>>','>>>','%'];
/**
 * @param {()=>number} next
 * @param {number} minimum
 * @param {number} maximum
 * @returns {string}
 */
function expression(next,minimum,maximum){
  let out='x';
  const steps=minimum+(next()%(maximum-minimum+1));
  for(let i=0;i<steps;i++){
    const op=operations[next()%operations.length];
    const rhs=next()%256;
    out='('+out+op+rhs+')';
  }
  return out;
}

/**
 * @param {()=>number} next
 * @param {number} depth
 * @returns {string}
 */
function tree(next,depth) {
  if(depth===0 || (next()&7)===0)return expression(next,0,3);
  const test=expression(next,0,2);
  return '('+test+'?'+tree(next,depth-1)+':'+tree(next,depth-1)+')';
}

/**
 * Evaluation uses distinct VM contexts so the attacker never executes its
 * parser inside the compiler's context. Only value and error class/message
 * are compared; stack-frame source positions are an acknowledged limitation.
 * @param {string} source
 * @returns {(value:Input)=>unknown}
 */
function load(source) {
  return /** @type {(value:Input)=>unknown} */ (
    vm.runInNewContext('(function(){const module={exports:{}};'+
      source+';return module.exports.f})()',{}, {timeout:1000})
  );
}

/**
 * @param {(value:Input)=>unknown} func
 * @param {Input} value
 * @returns {Outcome}
 */
function evaluate(func,value) {
  try{return {value:func(value)};}
  catch(error){const e=/** @type {Error} */ (error);return {error:e.name+':'+e.message};}
}

const started=performance.now();
let programs=0,variants=0,blocks=0,observations=0;
for(let seed=1;seed<=120;seed++){
  const next=generator((seed*2654435761)>>>0);
  const source='function f(x){return '+tree(next,5)+';}module.exports={f};';
  const original=load(source);
  let successful=false;
  for(const masked of [false,true]){
    const generated=flattenBranchBlocks(source,'commonjs',{
      seed:'held-out-'+seed,names:['f'],stateBlinding:masked
    });
    if(generated.functions!==1)continue;
    successful=true;
    const recovered=recoverBranchFunction(generated.code,'f');
    assert.equal(recovered.blocks,generated.blocks);
    const transformed=load(generated.code);
    const reconstructed=/** @type {(value:Input)=>unknown} */ (
      vm.runInNewContext('('+recovered.source+')',{}, {timeout:1000})
    );
    const inputs=/** @type {Input[]} */ ([
      -1024,-128,-1,0,1,2,7,15,63,127,255,512,1024,
      '0','7','',true,false,null,undefined,NaN,Infinity,-Infinity,
      0n,1n,Symbol('symbol')
    ]);
    for(const x of inputs){
      const expected=evaluate(original,x);
      assert.deepEqual(evaluate(transformed,x),expected,
        'compiler semantic difference case '+seed+' masked '+masked+' input '+String(x));
      assert.deepEqual(evaluate(reconstructed,x),expected,
        'recovery semantic difference case '+seed+' masked '+masked+' input '+String(x));
      observations+=2;
    }
    variants++;
    blocks+=recovered.blocks;
  }
  if(successful)programs++;
}
if(variants<180)throw Error('Insufficient accepted held-out samples');
console.log(JSON.stringify({
  programCount:programs,recoveredVariants:variants,
  recoveredBlocks:blocks,comparedEvaluations:observations,
  elapsedMs:performance.now()-started,
  node:process.version
},null,2));
