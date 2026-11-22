'use strict';

const assert=require('node:assert/strict');
const {
  forwardChain,
  inverseChain
}=require('./mba-permutation-component-inverse');

/**
 * Exact intended unsigned round from the author repository's
 * real-world/filename.h at revision
 * 6bd6f55f30529f39c910d9f37f04296d932c764d.
 *
 * The C source expresses cyclic terms as rotate-right distances
 * 61,44,34,32,35. The equivalent rotate-left distances are
 * 3,20,30,32,29.
 */
const round={
  coefficients:[
    8099674395506127609n,
    8077374509611717913n
  ],
  xorShifts:[22],
  cyclicShifts:[3,20,30,32,29]
};
const rounds=Array.from({length:48},()=>round);
const target=14887200154472500695n;

const recovered=inverseChain(target,rounds);
const slash=BigInt('/'.charCodeAt(0));
const backslash=BigInt('\\'.charCodeAt(0));
const slashOutput=forwardChain(slash,rounds);
const backslashOutput=forwardChain(backslash,rounds);

assert.equal(recovered,slash);
assert.equal(slashOutput,target);
assert.notEqual(backslashOutput,target);

// The source comment immediately above the replacement records the original
// Windows-family macro as: (C) == '/' || (C) == '\\'. The replacement has a
// single equality target, so this concrete backslash miss changes behavior.
assert.equal('/'.charCodeAt(0),47);
assert.equal('\\'.charCodeAt(0),92);

console.log(JSON.stringify({
  authorCommit:'6bd6f55f30529f39c910d9f37f04296d932c764d',
  artifact:'real-world/filename.h',
  rounds:48,
  publicTarget:'0x'+target.toString(16).padStart(16,'0'),
  recoveredPreimage:{
    decimal:Number(recovered),
    character:String.fromCharCode(Number(recovered))
  },
  slash:{
    input:Number(slash),
    output:'0x'+slashOutput.toString(16).padStart(16,'0'),
    accepted:slashOutput===target
  },
  backslash:{
    input:Number(backslash),
    output:'0x'+backslashOutput.toString(16).padStart(16,'0'),
    accepted:backslashOutput===target
  },
  originalWindowsMacroAcceptsBoth:true,
  replacementAcceptsBoth:false
},null,2));
