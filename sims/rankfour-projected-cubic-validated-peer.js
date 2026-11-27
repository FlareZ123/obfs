'use strict';

const assert = require('node:assert/strict');
const {createHash,randomBytes} = require('node:crypto');
const {learn,evaluate,SignatureSpanOverflowError} = require('./rankfour-projected-cubic-rescue');
const {learnBoundedDegreeOracle} = require('./bounded-degree-oracle-functional-clone');

/** @typedef {ReturnType<typeof learnBoundedDegreeOracle>} LowerModel */
/** @typedef {{bits:number,degree:2|3,projected:number[],cubic:number[],lower:LowerModel,queries:number,trials:number}} FastModel */
/** @typedef {{bits:number,degree:2|3,projected:number[],cubic:number[],lower:LowerModel,queries:number,trials:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,verificationAttempted:boolean,verificationPassed:boolean,falseAcceptanceBound:number,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean,verificationMismatchAt?:number|null,fallbackQueries?:number}} ValidatedModel */

/** @param {LowerModel} model @returns {boolean} */
function hasNonzeroCubicCoefficient(model) {
  return model.coefficients.some(([mask,coefficient])=>{
    if(coefficient===0)return false;
    let weight=0;
    for(let value=mask;value!==0;value&=value-1)weight++;
    return weight===3;
  });
}


/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let counter = 0;
  return () => createHash('sha256')
    .update(String(seed) + ':' + counter++)
    .digest().readUInt32BE(0);
}

/** @returns {number} */
function secureWord() {
  return randomBytes(4).readUInt32BE(0);
}

/** @param {number} n @param {number} weight @returns {number[]} */
function masksOfWeight(n,weight) {
  /** @type {number[]} */
  const result = [];
  /** @param {number} from @param {number} remaining @param {number} value */
  function visit(from,remaining,value) {
    if (remaining === 0) {
      result.push(value >>> 0);
      return;
    }
    for (let bit = from; bit <= n - remaining; bit++) {
      visit(bit+1,remaining-1,value ^ (1 << bit));
    }
  }
  visit(0,weight,0);
  return result;
}

/** @param {number} n @param {number} maximumWeight @returns {number[]} */
function masksThroughWeight(n,maximumWeight) {
  /** @type {number[]} */
  const result = [];
  for (let weight = 0; weight <= maximumWeight; weight++) {
    result.push(...masksOfWeight(n,weight));
  }
  return result;
}

/**
 * Cache a fixed deterministic n-bit Boolean oracle.
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @returns {{ask:(input:number)=>number,cache:Map<number,number>}}
 */
function cachedOracle(oracle,n) {
  const mask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  function ask(input) {
    const key = (input & mask) >>> 0;
    if (!cache.has(key)) {
      const value = oracle(key);
      if (!Number.isInteger(value) || value < 0 || value > mask) {
        throw new TypeError('Cubic oracle must return an n-bit unsigned integer');
      }
      cache.set(key,value >>> 0);
    }
    return /** @type {number} */ (cache.get(key));
  }
  return {ask,cache};
}

/**
 * Verify a projected cubic clone and fall back to exact degree-three ANF
 * interpolation when the returned candidate is inconsistent with the oracle.
 *
 * Contract: fixed deterministic degree-at-most-three n-bit Boolean function.
 * The fast learner must return a candidate; errors are allowed to propagate.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} [drawWitness]
 * @param {()=>number} [drawVerify]
 * @param {number} [delta]
 * @returns {ValidatedModel}
 */
function cloneProjectedCubicValidated(
  oracle,
  n,
  drawWitness = secureWord,
  drawVerify = secureWord,
  delta = 1e-10
) {
  if(!Number.isInteger(n)||n<4||n>32)
    throw new RangeError('Cubic wrapper requires 4..32 input bits');
  assert.ok(Number.isFinite(delta) && delta > 0 && delta < 1);
  const {ask,cache} = cachedOracle(oracle,n);
  const sampleLimit = Math.ceil(Math.log(delta) / Math.log(43 / 64));
  const verificationCap = Math.ceil(Math.log(delta) / Math.log(7 / 8));
  const fastCap = 7 * sampleLimit + 6 * n + 8 + masksThroughWeight(n,2).length;
  const fallbackCap = fastCap + verificationCap + masksOfWeight(n,3).length;
  /** @type {FastModel|null} */
  let fastModel = null;
  try {
    fastModel = /** @type {FastModel} */ (learn(ask,n,drawWitness,delta));
  } catch(error) {
    if(!(error instanceof SignatureSpanOverflowError))throw error;
    const fastQueries=cache.size;
    const beforeFallback=cache.size;
    const exactLower=learnBoundedDegreeOracle(ask,n,3);
    const fallbackQueries=cache.size-beforeFallback;
    assert.ok(cache.size<=fallbackCap,
      'Validated cubic clone exceeded its conservative signature-overflow fallback cap');
    return {
      bits:n,
      degree:hasNonzeroCubicCoefficient(exactLower)?3:2,
      projected:[],
      cubic:[],
      lower:exactLower,
      queries:cache.size,
      trials:error.trials,
      fastQueries,
      verificationQueries:0,
      verificationSamples:0,
      verificationCap,
      verificationDelta:delta,
      verificationAttempted:false,
      verificationPassed:false,
      falseAcceptanceBound:0,
      fallbackUsed:true,
      fallbackReason:'signature-span-overflow',
      verificationMismatchAt:null,
      fallbackQueries,
      exactByInterpolation:true
    };
  }
  if(fastModel===null)throw new Error('Cubic learner returned no model');
  const fastQueries = cache.size;
  const beforeVerification = cache.size;
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  let verificationSamples = 0;
  /** @type {number|null} */
  let mismatchAt = null;
  for (let i = 0; i < verificationCap; i++) {
    const input = (drawVerify() >>> 0) & inputMask;
    verificationSamples++;
    if (ask(input) !== evaluate(fastModel,input)) {
      mismatchAt = input >>> 0;
      break;
    }
  }
  const verificationQueries = cache.size - beforeVerification;
  if (mismatchAt === null) {
    assert.ok(cache.size <= fastCap + verificationCap);
    return {
      ...fastModel,
      queries:cache.size,
      fastQueries,
      verificationQueries,
      verificationSamples,
      verificationCap,
      verificationDelta:delta,
      verificationAttempted:true,
      verificationPassed:true,
      falseAcceptanceBound:delta,
      fallbackUsed:false,
      fallbackReason:null,
      exactByInterpolation:false
    };
  }

  const beforeFallback = cache.size;
  const exactLower = learnBoundedDegreeOracle(ask,n,3);
  const fallbackQueries = cache.size - beforeFallback;
  assert.ok(cache.size <= fallbackCap,'Validated cubic clone exceeded its conservative query cap');
  return {
    bits:n,
    degree:hasNonzeroCubicCoefficient(exactLower)?3:2,
    projected:[],
    cubic:[],
    lower:exactLower,
    queries:cache.size,
    trials:fastModel.trials,
    fastQueries,
    verificationQueries,
    verificationSamples,
    verificationCap,
    verificationDelta:delta,
    verificationAttempted:true,
    verificationPassed:false,
    falseAcceptanceBound:0,
    fallbackUsed:true,
    fallbackReason:'verification-mismatch',
    verificationMismatchAt:mismatchAt,
    fallbackQueries,
    exactByInterpolation:true
  };
}

/** @param {number[]} directions @returns {()=>number} */
function fixedDirections(directions) {
  let index = 0;
  return () => directions[index++ % directions.length] >>> 0;
}

/** @param {number} input @returns {number} */
function silentRankFivePermutationSource(input) {
  const x = input & 0x7f;
  return (
    x ^
    (((x & 7) === 7) ? 32 : 0) ^
    (((x & 28) === 28) ? 64 : 0)
  ) >>> 0;
}

/** @param {number} input @returns {number} */
function rankOneCubicSource(input) {
  const x = input & 0x7f;
  return (x ^ (((x & 7) === 7) ? 32 : 0)) >>> 0;
}

/** @param {number} input @returns {number} */
function degreeTwoSource(input) {
  const x = input & 0x7f;
  return (x ^ (((x & 3) === 3) ? 64 : 0)) >>> 0;
}

/** @param {number} input @returns {number} */
function rankFiveSignatureOverflowSource(input) {
  const x=input&0x7ff;
  return (x ^
    (((x&7)===7)?64:0) ^
    (((x&11)===11)?128:0) ^
    (((x&19)===19)?256:0) ^
    (((x&13)===13)?512:0) ^
    (((x&21)===21)?1024:0))>>>0;
}

/** @returns {object} */
function main() {
  const delta = 1e-10;
  assert.throws(()=>cloneProjectedCubicValidated(input=>input,3),RangeError,
    'the wrapper must reject widths unsupported by the fast learner');
  const verificationCap = Math.ceil(Math.log(delta) / Math.log(7 / 8));
  assert.equal(verificationCap,173);
  assert.ok(Math.pow(7/8,172) > delta);
  assert.ok(Math.pow(7/8,173) <= delta);
  const directions = [1,2,4];

  const rankOneSource = rankOneCubicSource;
  const rankOne = cloneProjectedCubicValidated(
    rankOneSource,7,fixedDirections(directions),seeded(0x44a202622),delta
  );
  assert.equal(rankOne.fallbackUsed,false);
  assert.equal(rankOne.verificationPassed,true);
  assert.equal(rankOne.degree,3);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluate(rankOne,input),rankOneSource(input));
  }

  const quadraticSource = degreeTwoSource;
  const quadratic = cloneProjectedCubicValidated(
    quadraticSource,7,() => 0,seeded(0x44a202623),delta
  );
  assert.equal(quadratic.fallbackUsed,false);
  assert.equal(quadratic.verificationPassed,true);
  assert.equal(quadratic.degree,2);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluate(quadratic,input),quadraticSource(input));
  }

  const raw = learn(silentRankFivePermutationSource,7,fixedDirections(directions),delta);
  assert.equal(raw.degree,3);
  assert.deepEqual(raw.projected,[1,2,4,0,0,0,0]);
  assert.equal(raw.cubic[7],32);
  /** @type {Set<number>} */
  const sourceOutputs = new Set();
  /** @type {Set<number>} */
  const rawOutputs = new Set();
  let rawMismatchCount = 0;
  for (let input = 0; input < 128; input++) {
    sourceOutputs.add(silentRankFivePermutationSource(input));
    rawOutputs.add(evaluate(raw,input));
    if (silentRankFivePermutationSource(input) !== evaluate(raw,input)) rawMismatchCount++;
  }
  assert.equal(sourceOutputs.size,128);
  assert.equal(rawOutputs.size,128);
  assert.equal(rawMismatchCount,16);

  const validated = cloneProjectedCubicValidated(
    silentRankFivePermutationSource,7,fixedDirections(directions),seeded(0x44a202621),delta
  );
  assert.equal(validated.fallbackUsed,true);
  assert.equal(validated.fallbackReason,'verification-mismatch');
  assert.equal(validated.degree,3,'exact fallback metadata must retain the genuine cubic degree');
  assert.notEqual(validated.verificationMismatchAt,null);
  assert.ok(validated.verificationSamples <= 173);
  assert.equal(validated.exactByInterpolation,true);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluate(validated,input),silentRankFivePermutationSource(input));
  }

  const overflowSource=rankFiveSignatureOverflowSource;
  const overflowValidated=cloneProjectedCubicValidated(
    overflowSource,11,fixedDirections(directions),seeded(0x44a202624),delta
  );
  assert.equal(overflowValidated.fallbackUsed,true);
  assert.equal(overflowValidated.fallbackReason,'signature-span-overflow');
  assert.equal(overflowValidated.verificationAttempted,false);
  assert.equal(overflowValidated.verificationSamples,0);
  assert.equal(overflowValidated.exactByInterpolation,true);
  assert.equal(overflowValidated.degree,3);
  assert.equal(overflowValidated.queries,232);
  for(let input=0;input<2048;input++)
    assert.equal(evaluate(overflowValidated,input),overflowSource(input));

  const n32SampleLimit = Math.ceil(Math.log(delta) / Math.log(43 / 64));
  const n32FastCap = 7 * n32SampleLimit + 6 * 32 + 8 + masksThroughWeight(32,2).length;
  const n32FallbackCap = n32FastCap + verificationCap + masksOfWeight(32,3).length;
  assert.equal(n32SampleLimit,58);
  assert.equal(n32FastCap,1135);
  assert.equal(n32FastCap + verificationCap,1308);
  assert.equal(n32FallbackCap,6268);

  const result = {
    delta,
    verificationCap,
    rankOneFastPath:{queries:rankOne.queries,verificationSamples:rankOne.verificationSamples},
    degreeTwoFastPath:{queries:quadratic.queries,verificationSamples:quadratic.verificationSamples},
    silentRankFive:{rawQueries:raw.queries,rawMismatchCount,relativeDistance:rawMismatchCount/128,
      fallbackReason:validated.fallbackReason,verificationMismatchAt:validated.verificationMismatchAt,
      verificationSamples:validated.verificationSamples,queries:validated.queries,exactAll128:true,
      sourceAndRawCandidateArePermutations:true},
    signatureOverflowFallback:{fallbackReason:overflowValidated.fallbackReason,
      fastQueries:overflowValidated.fastQueries,fallbackQueries:overflowValidated.fallbackQueries,
      queries:overflowValidated.queries,verificationAttempted:overflowValidated.verificationAttempted,
      exactAll2048:true},
    n32QueryCaps:{fast:n32FastCap,verifiedFast:n32FastCap+verificationCap,fallback:n32FallbackCap}
  };
  console.log('RANKFOUR_PROJECTED_CUBIC_REED_MULLER_VALIDATED_CLONE ' + JSON.stringify(result));
  return result;
}

if (require.main === module) main();
module.exports = {cloneProjectedCubicValidated,main};
