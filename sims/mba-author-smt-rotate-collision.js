'use strict';

const assert=require('node:assert/strict');

const WIDTH=64n;
const MASK=(1n<<WIDTH)-1n;
const SIGN=1n<<63n;

/**
 * Interpret a masked 64-bit word as signed two's-complement.
 * @param {bigint} value
 * @returns {bigint}
 */
function signed64(value){
  const word=value&MASK;
  return (word&SIGN)===0n?word:word-(1n<<WIDTH);
}

/**
 * Reproduce the SMT term emitted by the authors' generator.py:
 * ((x << shift) & MASK) | ((x >> (64-shift)) & MASK)
 * where Z3 BitVec.__rshift__ becomes arithmetic bvashr.
 *
 * @param {bigint} x
 * @param {number} shift
 * @returns {bigint}
 */
function emittedPseudoRotate(x,shift){
  const amount=BigInt(shift);
  const left=((x&MASK)<<amount)&MASK;
  const right=(signed64(x)>>(WIDTH-amount))&MASK;
  return (left|right)&MASK;
}

/**
 * Intended unsigned 64-bit rotate-left used by the authors' C artifacts.
 * @param {bigint} x
 * @param {number} shift
 * @returns {bigint}
 */
function rotateLeft64(x,shift){
  const amount=BigInt(shift);
  const word=x&MASK;
  return ((word<<amount)|(word>>(WIDTH-amount)))&MASK;
}

/**
 * @param {bigint} x
 * @param {number[]} shifts
 * @param {(x:bigint,shift:number)=>bigint} rotate
 * @returns {bigint}
 */
function xorRotations(x,shifts,rotate){
  let result=0n;
  for(const shift of shifts)result^=rotate(x,shift);
  return result&MASK;
}

// First cyclic-XOR layer in the committed author sample
// test on smt/1-2-3-16/1-2-3-16[0].smt2 at commit
// 6bd6f55f30529f39c910d9f37f04296d932c764d.
const shifts=[35,56,57];
const first=0x8000000000000000n;
const second=0x8000000000000001n;

const emittedFirst=xorRotations(first,shifts,emittedPseudoRotate);
const emittedSecond=xorRotations(second,shifts,emittedPseudoRotate);
const intendedFirst=xorRotations(first,shifts,rotateLeft64);
const intendedSecond=xorRotations(second,shifts,rotateLeft64);

assert.equal(emittedFirst,emittedSecond);
assert.notEqual(intendedFirst,intendedSecond);

console.log(JSON.stringify({
  authorCommit:'6bd6f55f30529f39c910d9f37f04296d932c764d',
  sample:'test on smt/1-2-3-16/1-2-3-16[0].smt2',
  shifts,
  inputs:[
    '0x'+first.toString(16).padStart(16,'0'),
    '0x'+second.toString(16).padStart(16,'0')
  ],
  emittedArithmeticShiftOutputs:[
    '0x'+emittedFirst.toString(16).padStart(16,'0'),
    '0x'+emittedSecond.toString(16).padStart(16,'0')
  ],
  intendedUnsignedRotateOutputs:[
    '0x'+intendedFirst.toString(16).padStart(16,'0'),
    '0x'+intendedSecond.toString(16).padStart(16,'0')
  ],
  emittedCollision:true,
  intendedCollision:false
},null,2));
