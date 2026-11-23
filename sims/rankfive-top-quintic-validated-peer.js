'use strict';

const assert = require('node:assert/strict');
const {createHash, randomBytes} = require('node:crypto');
const {cloneTopQuintic} = require('./rankfive-top-quintic-functional-clone-peer');

/** @typedef {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5,queries:number,trials:number,quotientRank:number,trialCap:number}} FastModel */
/** @typedef {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5,queries:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,verificationPassed:boolean,falseAcceptanceBound:number,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean,trials?:number,quotientRank?:number,trialCap?:number,verificationMismatchAt?:number|null,fallbackQueries?:number}} ValidatedModel */

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
function masksOfWeight(n, weight) {
  /** @type {number[]} */
  const result = [];
  /** @param {number} from @param {number} remaining @param {number} value */
  function visit(from, remaining, value) {
    if (remaining === 0) {
      result.push(value >>> 0);
      return;
    }
    for (let bit = from; bit <= n - remaining; bit++) {
      visit(bit + 1, remaining - 1, value ^ (1 << bit));
    }
  }
  visit(0, weight, 0);
  return result;
}

/** @param {number} n @param {number} maximumWeight @returns {number[]} */
function masksThroughWeight(n, maximumWeight) {
  /** @type {number[]} */
  const result = [];
  for (let weight = 0; weight <= maximumWeight; weight++) {
    result.push(...masksOfWeight(n, weight));
  }
  return result;
}

/**
 * Build an exact degree-five ANF model from the complete weight-at-most-five
 * evaluation basis. This is the fail-safe path for any fixed degree<=5 source.
 *
 * @param {(input:number)=>number} ask
 * @param {number} n
 * @returns {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5}}
 */
function exactDegreeFiveModel(ask, n) {
  /** @type {Map<number,number>} */
  const coefficients = new Map();
  for (const input of masksThroughWeight(n, 4)) {
    let coefficient = ask(input) >>> 0;
    if (input !== 0) {
      for (let subset = ((input - 1) & input); ; subset = ((subset - 1) & input)) {
        coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
        if (subset === 0) break;
      }
    }
    coefficients.set(input >>> 0, coefficient >>> 0);
  }

  /** @type {Array<[number,number]>} */
  const lower = Array.from(coefficients.entries()).filter(([,value]) => value !== 0);
  /** @type {Array<[number,number]>} */
  const top = [];
  for (const support of masksOfWeight(n, 5)) {
    let coefficient = ask(support) >>> 0;
    for (let subset = ((support - 1) & support); ; subset = ((subset - 1) & support)) {
      coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
      if (subset === 0) break;
    }
    if (coefficient !== 0) top.push([support >>> 0, coefficient >>> 0]);
  }
  return {bits:n,lower,top,degree:top.length > 0 ? 5 : 4};
}

/** @param {FastModel} model @param {number} input @returns {number} */
function evaluateModel(model, input) {
  const mask = model.bits === 32 ? 0xffffffff : (2 ** model.bits - 1);
  const x = (input & mask) >>> 0;
  let result = 0;
  for (const [support,coefficient] of model.lower) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  for (const [support,coefficient] of model.top) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  return result >>> 0;
}

/**
 * Cache a deterministic unsigned 32-bit oracle. The caller's source must be
 * fixed and stateless for the algebraic and verification guarantees.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @returns {{ask:(input:number)=>number,cache:Map<number,number>}}
 */
function cachedOracle(oracle, n) {
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  function ask(input) {
    const key = (input & inputMask) >>> 0;
    if (!cache.has(key)) {
      const value = oracle(key);
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new TypeError('Quintic oracle must return unsigned 32-bit integers');
      }
      cache.set(key, value >>> 0);
    }
    return /** @type {number} */ (cache.get(key));
  }
  return {ask,cache};
}

/**
 * Attempt the fast rank-six quotient learner, then validate its candidate
 * against fresh uniform points. A mismatch or signature-span overflow causes
 * exact degree-five ANF interpolation using the same cache.
 *
 * Correctness contract: a fixed, deterministic vector Boolean function of
 * degree at most five. No exact joint-radical promise is required for the
 * final result; it only affects whether the fast candidate is accepted.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} [drawWitness]
 * @param {()=>number} [drawVerify]
 * @param {number} [delta]
 * @returns {ValidatedModel}
 */
function cloneTopQuinticValidated(
  oracle,
  n,
  drawWitness = secureWord,
  drawVerify = secureWord,
  delta = 1e-10
) {
  assert.ok(Number.isInteger(n) && n >= 5 && n <= 32);
  assert.ok(Number.isFinite(delta) && delta > 0 && delta < 1);
  const {ask,cache} = cachedOracle(oracle,n);
  const verificationCap = Math.ceil(Math.log(delta) / Math.log(31 / 32));
  /** @type {FastModel|null} */
  let fastModel = null;
  /** @type {string|null} */
  let fastFailure = null;

  try {
    fastModel = /** @type {FastModel} */ (cloneTopQuintic(ask,n,drawWitness,delta));
  } catch (error) {
    const candidate = /** @type {{code?:string,message?:string}} */ (error);
    if (candidate.code === 'ERR_ASSERTION' &&
        String(candidate.message).includes('fifth-derivative signature span exceeds six')) {
      fastFailure = 'signature-span-overflow';
    } else {
      throw error;
    }
  }

  const fastQueries = cache.size;
  let verificationSamples = 0;
  let verificationQueries = 0;
  /** @type {number|null} */
  let mismatchAt = null;
  if (fastModel !== null) {
    const beforeVerification = cache.size;
    const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
    for (let i = 0; i < verificationCap; i++) {
      const input = (drawVerify() >>> 0) & inputMask;
      verificationSamples++;
      const observed = ask(input);
      if (observed !== evaluateModel(fastModel,input)) {
        mismatchAt = input >>> 0;
        break;
      }
    }
    verificationQueries = cache.size - beforeVerification;
    if (mismatchAt === null) {
      return {
        ...fastModel,
        queries:cache.size,
        fastQueries,
        verificationQueries,
        verificationSamples,
        verificationCap,
        verificationDelta:delta,
        verificationPassed:true,
        falseAcceptanceBound:delta,
        fallbackUsed:false,
        fallbackReason:null,
        exactByInterpolation:false
      };
    }
  }

  const beforeFallback = cache.size;
  const exact = exactDegreeFiveModel(ask,n);
  const fallbackQueries = cache.size - beforeFallback;
  return {
    ...exact,
    queries:cache.size,
    fastQueries,
    verificationQueries,
    verificationSamples,
    verificationCap,
    verificationDelta:delta,
    verificationPassed:false,
    falseAcceptanceBound:0,
    fallbackUsed:true,
    fallbackReason:fastFailure ?? 'verification-mismatch',
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

/** @param {number} n @returns {(input:number)=>number} */
function rankOneQuinticSource(n) {
  const mask = n === 32 ? 0xffffffff : (2 ** n - 1);
  return input => {
    const x = (input & mask) >>> 0;
    return (x ^ ((x & 31) === 31 ? 0x80000000 : 0)) >>> 0;
  };
}

/** @param {number} n @returns {(input:number)=>number} */
function degreeFourSource(n) {
  const mask = n === 32 ? 0xffffffff : (2 ** n - 1);
  return input => {
    const x = (input & mask) >>> 0;
    return (x ^ ((x & 3) === 3 ? 0x13579bdf : 0)) >>> 0;
  };
}

/** @returns {(input:number)=>number} */
function rankSevenSilentSource() {
  return input => (
    (((input & 31) === 31) ? 1 : 0) ^
    (((input & 124) === 124) ? 2 : 0)
  ) >>> 0;
}

/** @returns {(input:number)=>number} */
function rankSevenOverflowSource() {
  const terms = masksOfWeight(7,5).map((support,index)=>[support,2 ** index]);
  return input => {
    let result = 0;
    for (const [support,coefficient] of terms) {
      if ((input & support) === support) result ^= coefficient;
    }
    return result >>> 0;
  };
}

/** @returns {object} */
function main() {
  const directions = [1,2,4,8,16,32];
  const positive = cloneTopQuinticValidated(
    rankOneQuinticSource(32),
    32,
    fixedDirections(directions),
    seeded(0x44a202611)
  );
  assert.equal(positive.verificationPassed,true);
  assert.equal(positive.fallbackUsed,false);
  assert.equal(positive.degree,5);
  assert.ok(positive.queries <= 44836);

  const noTop = cloneTopQuinticValidated(
    degreeFourSource(32),
    32,
    () => 0,
    seeded(0x44a202612)
  );
  assert.equal(noTop.verificationPassed,true);
  assert.equal(noTop.fallbackUsed,false);
  assert.equal(noTop.degree,4);
  assert.ok(noTop.queries <= 44836);

  const silentSource = rankSevenSilentSource();
  const silentVerificationRng = seeded(0x44a202613);
  const silent = cloneTopQuinticValidated(
    silentSource,
    7,
    fixedDirections(directions),
    silentVerificationRng
  );
  assert.equal(silent.fallbackUsed,true);
  assert.equal(silent.fallbackReason,'verification-mismatch');
  assert.notEqual(silent.verificationMismatchAt,null);
  assert.ok(silent.verificationSamples <= 726);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluateModel(silent,input),silentSource(input));
  }

  const overflowSource = rankSevenOverflowSource();
  const overflow = cloneTopQuinticValidated(
    overflowSource,
    7,
    fixedDirections(directions),
    seeded(0x44a202614)
  );
  assert.equal(overflow.fallbackUsed,true);
  assert.equal(overflow.fallbackReason,'signature-span-overflow');
  assert.equal(overflow.exactByInterpolation,true);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluateModel(overflow,input),overflowSource(input));
  }

  const summary = {
    verification:{
      reedMuller:'RM(5,n) minimum relative distance is 1/32 for every nonzero degree<=5 difference',
      delta:1e-10,
      samples:726,
      falseAcceptanceUpperBound:Math.pow(31/32,726)
    },
    fastPositive:{
      queries:positive.queries,
      fastQueries:positive.fastQueries,
      verificationQueries:positive.verificationQueries,
      degree:positive.degree,
      quotientRank:positive.quotientRank
    },
    exactDegreeFourFallbackControl:{
      queries:noTop.queries,
      verificationQueries:noTop.verificationQueries,
      degree:noTop.degree
    },
    silentRankSevenControl:{
      fallbackReason:silent.fallbackReason,
      verificationSamples:silent.verificationSamples,
      verificationMismatchAt:silent.verificationMismatchAt,
      sourceAt124:silentSource(124),
      cloneAt124:evaluateModel(silent,124),
      exactAll128:true,
      queries:silent.queries
    },
    detectedRankSevenControl:{
      fallbackReason:overflow.fallbackReason,
      exactAll128:true,
      queries:overflow.queries
    },
    n32Caps:{
      lowerBasis:41449,
      universalWitnessTrials:27,
      witnessAndSignatureOverhead:63*27+30*32,
      fastCap:44110,
      verificationCap:44836,
      genericDegreeFiveBasis:242825,
      verifiedFallbackCap:246212
    },
    note:'Degree<=5 and fixed deterministic source are required. Random verification removes the exact radical-rank promise from correctness, not the degree promise.'
  };
  console.log('VALIDATED_TOP_QUINTIC_CLONE ' + JSON.stringify(summary));
  return summary;
}

if (require.main === module) main();
module.exports = {cloneTopQuinticValidated,exactDegreeFiveModel,main};
