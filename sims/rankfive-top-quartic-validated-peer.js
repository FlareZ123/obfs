'use strict';

const assert = require('node:assert/strict');
const {createHash,randomBytes} = require('node:crypto');
const {clone,evaluate} = require('./rankfive-top-quartic-functional-clone');

/** @typedef {{bits:number,base:Map<number,number>,quartic:Array<[number,number]>,degree:3|4,queries:number,trials?:number,quotientRank?:number}} FastModel */
/** @typedef {{bits:number,base:Map<number,number>,quartic:Array<[number,number]>,degree:3|4,queries:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,verificationPassed:boolean,falseAcceptanceBound:number,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean,trials?:number,quotientRank?:number,verificationMismatchAt?:number|null,fallbackQueries?:number}} ValidatedModel */

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
    result.push(...masksOfWeight(n,weight));
  }
  return result;
}

/**
 * Exact degree-four ANF interpolation over the complete weight-at-most-four basis.
 *
 * @param {(input:number)=>number} ask
 * @param {number} n
 * @returns {{bits:number,base:Map<number,number>,quartic:Array<[number,number]>,degree:3|4}}
 */
function exactDegreeFourModel(ask,n) {
  /** @type {Map<number,number>} */
  const coefficients = new Map();
  for (const input of masksThroughWeight(n,3)) {
    let coefficient = ask(input) >>> 0;
    if (input !== 0) {
      for (let subset = ((input - 1) & input); ; subset = ((subset - 1) & input)) {
        coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
        if (subset === 0) break;
      }
    }
    coefficients.set(input >>> 0,coefficient >>> 0);
  }
  /** @type {Map<number,number>} */
  const base = new Map(
    Array.from(coefficients.entries()).filter(([,value]) => value !== 0)
  );
  /** @type {Array<[number,number]>} */
  const quartic = [];
  for (const support of masksOfWeight(n,4)) {
    let coefficient = ask(support) >>> 0;
    for (let subset = ((support - 1) & support); ; subset = ((subset - 1) & support)) {
      coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
      if (subset === 0) break;
    }
    if (coefficient !== 0) quartic.push([support >>> 0,coefficient >>> 0]);
  }
  return {bits:n,base,quartic,degree:quartic.length > 0 ? 4 : 3};
}

/**
 * Cache a fixed deterministic unsigned 32-bit oracle.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @returns {{ask:(input:number)=>number,cache:Map<number,number>}}
 */
function cachedOracle(oracle,n) {
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  function ask(input) {
    const key = (input & inputMask) >>> 0;
    if (!cache.has(key)) {
      const value = oracle(key);
      if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
        throw new TypeError('Quartic oracle must return signed or unsigned 32-bit integers');
      }
      cache.set(key,value >>> 0);
    }
    return /** @type {number} */ (cache.get(key));
  }
  return {ask,cache};
}

/**
 * Attempt the fast rank-five quartic clone, postfit-verify it, and interpolate
 * exactly if it is wrong or its signature span overflows.
 *
 * Correctness contract: a fixed deterministic vector Boolean function of
 * degree at most four. No exact joint-radical promise is required for the
 * final returned model; it only affects fast-path success.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} [drawWitness]
 * @param {()=>number} [drawVerify] Independent uniform words for postfit checks; seeded only in tests.
 * @param {number} [delta]
 * @returns {ValidatedModel}
 */
function cloneTopQuarticValidated(
  oracle,
  n,
  drawWitness = secureWord,
  drawVerify = secureWord,
  delta = 1e-10
) {
  assert.ok(Number.isInteger(n) && n >= 4 && n <= 32);
  assert.ok(Number.isFinite(delta) && delta > 0 && delta < 1);
  const {ask,cache} = cachedOracle(oracle,n);
  const trialCap = Math.ceil(Math.log(delta) / Math.log(1 - 315 / 1024));
  const verificationCap = Math.ceil(Math.log(delta) / Math.log(15 / 16));
  const fastCap = masksThroughWeight(n,3).length + 15 * trialCap + 14 * n;
  const fallbackCap = fastCap + verificationCap + masksOfWeight(n,4).length;
  /** @type {FastModel|null} */
  let fastModel = null;
  /** @type {string|null} */
  let fastFailure = null;

  try {
    fastModel = /** @type {FastModel} */ (clone(ask,n,drawWitness,delta));
  } catch (error) {
    const candidate = /** @type {{code?:string,message?:string}} */ (error);
    if (candidate.code === 'ERR_ASSERTION' &&
        String(candidate.message).includes('fourth-derivative signature span exceeds five')) {
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
      if (observed !== evaluate(fastModel,input)) {
        mismatchAt = input >>> 0;
        break;
      }
    }
    verificationQueries = cache.size - beforeVerification;
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
        verificationPassed:true,
        falseAcceptanceBound:delta,
        fallbackUsed:false,
        fallbackReason:null,
        exactByInterpolation:false
      };
    }
  }

  const beforeFallback = cache.size;
  const exact = exactDegreeFourModel(ask,n);
  const fallbackQueries = cache.size - beforeFallback;
  assert.ok(cache.size <= fallbackCap,'Validated quartic clone exceeded its conservative query cap');
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

/** @returns {(input:number)=>number} */
function rankOneQuarticSource() {
  return input => {
    const x = input & 0xff;
    return (x ^ ((x & 15) === 15 ? 64 : 0)) >>> 0;
  };
}

/** @returns {(input:number)=>number} */
function degreeThreeSource() {
  return input => {
    const x = input & 0xff;
    return (x ^ ((x & 7) === 7 ? 64 : 0)) >>> 0;
  };
}

/** @returns {(input:number)=>number} */
function silentRankSixPermutationSource() {
  return input => {
    const x = input & 0xff;
    return (
      x ^
      (((x & 15) === 15) ? 64 : 0) ^
      (((x & 60) === 60) ? 128 : 0)
    ) >>> 0;
  };
}

/** @returns {object} */
function main() {
  const directions = [1,2,4,8];
  const verificationCap = Math.ceil(Math.log(1e-10) / Math.log(15 / 16));
  assert.equal(verificationCap,357);
  assert.ok(Math.pow(15/16,356) > 1e-10);
  assert.ok(Math.pow(15/16,357) <= 1e-10);

  const rankOne = cloneTopQuarticValidated(
    rankOneQuarticSource(),
    8,
    fixedDirections(directions),
    seeded(0x44a202618)
  );
  assert.equal(rankOne.fallbackUsed,false);
  assert.equal(rankOne.verificationPassed,true);
  assert.equal(rankOne.degree,4);
  assert.deepEqual(rankOne.quartic,[[15,64]]);
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluate(rankOne,input),rankOneQuarticSource()(input));
  }

  const degreeThree = cloneTopQuarticValidated(
    degreeThreeSource(),
    8,
    () => 0,
    seeded(0x44a202619)
  );
  assert.equal(degreeThree.fallbackUsed,false);
  assert.equal(degreeThree.verificationPassed,true);
  assert.equal(degreeThree.degree,3);
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluate(degreeThree,input),degreeThreeSource()(input));
  }

  const silentSource = silentRankSixPermutationSource();
  const raw = clone(
    silentSource,
    8,
    fixedDirections(directions),
    1e-10
  );
  assert.equal(raw.quotientRank,4);
  assert.deepEqual(raw.quartic,[[15,64]]);
  /** @type {Set<number>} */
  const sourceOutputs = new Set();
  /** @type {Set<number>} */
  const rawOutputs = new Set();
  let rawMismatchCount = 0;
  for (let input = 0; input < 256; input++) {
    sourceOutputs.add(silentSource(input));
    rawOutputs.add(evaluate(raw,input));
    if (silentSource(input) !== evaluate(raw,input)) rawMismatchCount++;
  }
  assert.equal(sourceOutputs.size,256);
  assert.equal(rawOutputs.size,256);
  assert.equal(rawMismatchCount,16);

  const validated = cloneTopQuarticValidated(
    silentSource,
    8,
    fixedDirections(directions),
    seeded(0x44a202617)
  );
  assert.equal(validated.fallbackUsed,true);
  assert.equal(validated.fallbackReason,'verification-mismatch');
  assert.notEqual(validated.verificationMismatchAt,null);
  assert.ok(validated.verificationSamples <= 357);
  assert.equal(validated.exactByInterpolation,true);
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluate(validated,input),silentSource(input));
  }

  const n32FastCap = masksThroughWeight(32,3).length + 15 * 63 + 14 * 32;
  const n32FallbackCap = n32FastCap + 357 + masksOfWeight(32,4).length;
  assert.equal(n32FastCap,6882);
  assert.equal(n32FallbackCap,43199);

  const result = {
    delta:1e-10,
    verificationCap,
    rankOneFastPath:{queries:rankOne.queries,verificationSamples:rankOne.verificationSamples,degree:rankOne.degree},
    degreeThreeFastPath:{queries:degreeThree.queries,verificationSamples:degreeThree.verificationSamples,degree:degreeThree.degree},
    silentRankSix:{rawQueries:raw.queries,rawMismatchCount,rawRelativeDistance:rawMismatchCount/256,
      fallbackReason:validated.fallbackReason,verificationMismatchAt:validated.verificationMismatchAt,
      verificationSamples:validated.verificationSamples,queries:validated.queries,
      exactAll256:true,sourceAndRawCandidateArePermutations:true},
    n32QueryCaps:{fast:n32FastCap,verifiedFast:n32FastCap+357,fallback:n32FallbackCap}
  };
  console.log('RANKFIVE_TOP_QUARTIC_REED_MULLER_VALIDATED_CLONE ' + JSON.stringify(result));
  return result;
}

if (require.main === module) main();
module.exports = {cloneTopQuarticValidated,exactDegreeFourModel,main};
