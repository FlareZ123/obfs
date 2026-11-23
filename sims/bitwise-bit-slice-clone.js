'use strict';

/**
 * Reconstruct a *promised* k-input, 32-bit, pointwise Boolean circuit from
 * exactly 2^k calls. Its source grammar may contain arbitrary compositions
 * of bitwise &, |, ^, ~ and fixed signed Int32 constants. Every output bit
 * then depends only on the k corresponding input bits and the constants'
 * bits, so the all-zero/all-one query corners reveal its entire truth table.
 * The statement is false for +, -, shifts, state or host effects, and more
 * than k live inputs. The method does not verify the promise by itself.
 *
 * @param {(...args:number[])=>number} oracle Black-box callable.
 * @param {number} arity Positive integer 1..4. Exponential beyond this limit.
 * @returns {{queries:number,masks:number[],evaluate:(...args:number[])=>number}}
 */
function cloneBitwiseBitSlice(oracle,arity){
  if(typeof oracle!=='function')throw new TypeError('Oracle must be callable');
  if(!Number.isSafeInteger(arity)||arity<1||arity>4)
    throw new RangeError('Arity must be 1 through 4');
  const queries=2**arity;
  /** @type {number[]} */
  const masks=[];
  for(let pattern=0;pattern<queries;pattern++){
    const args=Array.from({length:arity},(_,bit)=>pattern&(1<<bit)?-1:0);
    const value=oracle(...args);
    if(!Number.isInteger(value)||value<-2147483648||value>2147483647)
      throw new TypeError('Bit-slice oracle must return signed Int32 values');
    masks.push(value|0);
  }
  /** @param {...number} args @returns {number} */
  const evaluate=(...args)=>{
    if(args.length!==arity||args.some(x=>!Number.isInteger(x)||
      x<-2147483648||x>2147483647))
      throw new TypeError('Clone requires exactly k signed Int32 arguments');
    let result=0;
    for(let pattern=0;pattern<queries;pattern++){
      let term=masks[pattern];
      for(let bit=0;bit<arity;bit++){
        term&=pattern&(1<<bit)?args[bit]:~args[bit];
      }
      result|=term;
    }
    return result|0;
  };
  return {queries,masks,evaluate};
}

module.exports={cloneBitwiseBitSlice};
