'use strict';

/**
 * Exact black-box cloning for the explicit promise of a deterministic,
 * stateless affine function over the ring Z/(2^32):
 *
 *   F(x_0,...,x_(k-1)) = c + sum_i a_i*x_i (mod 2^32).
 *
 * Evaluations at the zero vector and each unit basis vector recover all
 * coefficients in exactly k+1 queries, irrespective of source syntax, MBA
 * layering, expression order or compiler seed. Signed Int32 arguments and
 * outputs are part of the externally proved contract. The implementation
 * cannot itself certify affine shape; true XOR, shifts, x*y, host mutations,
 * floating coercion and unknown state are excluded.
 *
 * @param {(...args:number[])=>number} oracle
 * @param {number} arity Positive safe-integer number of arguments, 1..8.
 * @returns {{queries:number,constant:number,coefficients:number[],
 *   evaluate:(...args:number[])=>number}}
 */
function cloneMod32Affine(oracle,arity){
  if(typeof oracle!=='function')throw new TypeError('Oracle must be callable');
  if(!Number.isSafeInteger(arity)||arity<1||arity>8)
    throw new RangeError('Arity must be an integer from 1 through 8');
  /** @param {number} value @returns {number} */
  const requireInt32=value=>{
    if(!Number.isInteger(value)||value<-2147483648||value>2147483647)
      throw new TypeError('Expected finite signed Int32 oracle and clone values');
    return value|0;
  };
  const zero=Array(arity).fill(0);
  const constant=requireInt32(oracle(...zero));
  /** @type {number[]} */
  const coefficients=[];
  for(let axis=0;axis<arity;axis++){
    const input=[...zero];
    input[axis]=1;
    coefficients.push((requireInt32(oracle(...input))-constant)|0);
  }
  /** @param {...number} args @returns {number} */
  const evaluate=(...args)=>{
    if(args.length!==arity)throw new TypeError('Wrong arity');
    let result=constant;
    for(let i=0;i<arity;i++)result=(result+
      Math.imul(coefficients[i],requireInt32(args[i])))|0;
    return result;
  };
  return {queries:arity+1,constant,coefficients,evaluate};
}

module.exports={cloneMod32Affine};
