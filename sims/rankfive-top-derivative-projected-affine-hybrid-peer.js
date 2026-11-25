'use strict';

const assert = require('node:assert/strict');
const {createHash, randomBytes} = require('node:crypto');
const {evaluateProjectedAffineModel} = require('./projected-affine-coset-profile-clone');

/** @typedef {{kind:'projected-affine',bits:number,rank:5,table:number[],coordinates:number[],affineCorrections:number[]}} ProjectedModel */
/** @typedef {{kind:'anf',bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5}} AnfModel */
/** @typedef {ProjectedModel|AnfModel} HybridModel */
/** @typedef {'six-direction'|'seven-direction-restart'} WitnessStrategy */
/** @typedef {{fastPathSuccess:boolean,witnessStrategy:WitnessStrategy,witnessTrials:number,witnessTrialCap:number,witnessDrawCount:number,witnessProbability:number,witnessFailureBound:number,quotientRank:number|null,coordinateStrategy:'shift'|'signature'|null,fixedPairPassed:boolean|null,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number|null,falseAcceptanceBound:number|null,verificationPassed:boolean|null,verificationMode:'verify-degree-five'|'assume-projected-affine',promiseAssumed:boolean,fallbackUsed:boolean,fallbackReason:string|null,fallbackQueries:number,exactByInterpolation:boolean}} Diagnostics */
/** @typedef {{model:HybridModel,queries:number,diagnostics:Diagnostics}} CloneResult */

/** @returns {number} */
function secureWord() {
  return randomBytes(4).readUInt32BE(0);
}

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let counter = 0;
  return () => createHash('sha256')
    .update(String(seed) + ':' + counter++)
    .digest().readUInt32BE(0);
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

/** @param {number[]} vectors @param {number} width @returns {number} */
function vectorRank(vectors, width) {
  const pivots = Array(width).fill(0);
  let rank = 0;
  for (let vector of vectors) {
    vector >>>= 0;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((vector >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) vector = (vector ^ pivots[bit]) >>> 0;
      else {
        pivots[bit] = vector;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/** @param {number} x @returns {number} */
function parity32(x) {
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x ^= x >>> 2;
  x ^= x >>> 1;
  return x & 1;
}

/**
 * Exact degree-five ANF fallback. The caller's cache is reused, and this
 * interpolation is exact under the fixed degree-at-most-five contract.
 *
 * @param {(input:number)=>number} ask
 * @param {number} n
 * @returns {AnfModel}
 */
function exactDegreeFiveModel(ask, n) {
  /** @type {Map<number,number>} */
  const coefficients = new Map();
  for (let weight = 0; weight <= 4; weight++) {
    for (const input of masksOfWeight(n, weight)) {
      let coefficient = ask(input) >>> 0;
      if (input !== 0) {
        for (let subset = ((input - 1) & input); ; subset = ((subset - 1) & input)) {
          coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
          if (subset === 0) break;
        }
      }
      coefficients.set(input >>> 0, coefficient >>> 0);
    }
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
  return {kind:'anf',bits:n,lower,top,degree:top.length > 0 ? 5 : 4};
}

/** @param {HybridModel} model @param {number} input @returns {number} */
function evaluateHybridModel(model, input) {
  if (model.kind === 'projected-affine') {
    return evaluateProjectedAffineModel(model, input);
  }
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
 * Discover a codimension-five quotient from the fifth derivative, then build
 * a projected-affine section-table candidate without querying the complete
 * weight-at-most-four ANF basis. A fresh RM(5,n) verifier protects against
 * silent higher-rank promise violations; any detected mismatch falls back
 * to exact degree-five interpolation.
 *
 * Fast-path source promise: fixed degree<=5 and fifth-derivative joint-radical
 * codimension exactly five. Correctness of an accepted candidate is protected
 * more broadly by the degree<=5 contract and independent postfit samples.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} [drawWitness]
 * @param {()=>number} [drawVerify] Must be independent uniform words, separate from witness draws.
 * @param {number} [delta]
 * @param {()=>void} [onCandidateReady] Called after candidate construction and before verifier draws are requested.
 * @param {WitnessStrategy} [witnessStrategy] Selects the six-direction or exact seven-direction restart policy.
 * @param {'verify-degree-five'|'assume-projected-affine'} [verificationMode] The second mode assumes the exact projected-affine rank-five source promise and skips postfit queries.
 * @returns {CloneResult}
 */
function cloneTopDerivativeProjectedAffine(
  oracle,
  n,
  drawWitness = secureWord,
  drawVerify = secureWord,
  delta = 1e-10,
  onCandidateReady = () => {},
  witnessStrategy = 'six-direction',
  verificationMode = 'verify-degree-five'
) {
  assert.ok(Number.isInteger(n) && n >= 5 && n <= 32);
  assert.ok(Number.isFinite(delta) && delta > 0 && delta < 1);
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {Map<number,number>} */
  const cache = new Map();

  /** @param {number} input @returns {number} */
  function ask(input) {
    const key = (input & inputMask) >>> 0;
    if (!cache.has(key)) {
      const value = oracle(key);
      if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
        throw new TypeError('Quintic oracle must return signed or unsigned 32-bit integers');
      }
      cache.set(key, value >>> 0);
    }
    return /** @type {number} */ (cache.get(key));
  }

  /** @param {number[]} directions @returns {number} */
  function fifthDerivative(directions) {
    let result = 0;
    for (let subset = 0; subset < 32; subset++) {
      let input = 0;
      for (let bit = 0; bit < 5; bit++) {
        if (((subset >>> bit) & 1) !== 0) input ^= directions[bit];
      }
      result ^= ask(input >>> 0);
    }
    return result >>> 0;
  }

  assert.ok(witnessStrategy === 'six-direction' ||
    witnessStrategy === 'seven-direction-restart');
  assert.ok(verificationMode === 'verify-degree-five' ||
    verificationMode === 'assume-projected-affine');
  const directionCount = witnessStrategy === 'six-direction' ? 6 : 7;
  /** @type {number[][]} */
  const faceComplements = witnessStrategy === 'six-direction'
    ? [[0],[1],[2],[3],[4],[5]]
    : [[0,1],[0,2],[0,3],[0,4],[0,5],[1,6],[2,6],[3,6],[4,6],[5,6]];
  // The seven-direction policy tests the exact ten-face restart optimum.
  // Its probability is for those ten faces only, not all 21 possible faces.
  const witnessProbability = witnessStrategy === 'six-direction'
    ? (63 / 64) * (62 / 64) * (60 / 64) * (56 / 64) * (48 / 64)
    : 24519915 / 33554432;
  const witnessTrialCap = Math.ceil(Math.log(delta) / Math.log(1 - witnessProbability));
  const verificationCap = Math.ceil(Math.log(delta) / Math.log(31 / 32));

  /** @type {number[]} */
  let anchors = [];
  let witness = 0;
  let witnessTrials = 0;
  /** @type {'shift'|'signature'|null} */
  let coordinateStrategy = null;
  /** @type {boolean|null} */
  let fixedPairPassed = null;
  while (witnessTrials < witnessTrialCap) {
    const directions = Array.from({length:directionCount},
      () => ((drawWitness() >>> 0) & inputMask) >>> 0);
    let found = false;
    for (const complement of faceComplements) {
      const tuple = directions.filter((_,index) => !complement.includes(index));
      const observed = fifthDerivative(tuple);
      if (observed !== 0) {
        anchors = tuple;
        witness = observed;
        found = true;
        break;
      }
    }
    witnessTrials++;
    if (found) break;
  }

  /** @param {string} reason @param {number} fastQueries @param {number} verificationSamples @param {number} verificationQueries @returns {CloneResult} */
  function fallback(reason, fastQueries, verificationSamples, verificationQueries) {
    const beforeFallback = cache.size;
    const model = exactDegreeFiveModel(ask,n);
    return {
      model,
      queries:cache.size,
      diagnostics:{
        fastPathSuccess:false,
        witnessTrials,
        witnessTrialCap,
        witnessStrategy,
        witnessDrawCount:witnessTrials * directionCount,
        witnessProbability,
        witnessFailureBound:Math.pow(1-witnessProbability,witnessTrialCap),
        quotientRank:null,
        coordinateStrategy,
        fixedPairPassed,
        fastQueries,
        verificationQueries,
        verificationSamples,
        verificationMode,
        promiseAssumed:verificationMode==='assume-projected-affine',
        verificationCap:verificationMode==='verify-degree-five'?verificationCap:0,
        verificationDelta:verificationMode==='verify-degree-five'?delta:null,
        falseAcceptanceBound:verificationMode==='verify-degree-five'?0:null,
        verificationPassed:verificationMode==='verify-degree-five'?false:null,
        fallbackUsed:true,
        fallbackReason:reason,
        fallbackQueries:cache.size-beforeFallback,
        exactByInterpolation:true
      }
    };
  }

  if (witness === 0) {
    return fallback('no-witness-within-trial-cap',cache.size,0,0);
  }

  // The successful five-dimensional derivative face already populated
  // every section-table entry in the query cache.
  /** @type {number[]} */
  const table = [];
  for (let index = 0; index < 32; index++) {
    let input = 0;
    for (let bit = 0; bit < 5; bit++) {
      if (((index >>> bit) & 1) !== 0) input ^= anchors[bit];
    }
    table.push(ask(input >>> 0));
  }

  // A deterministic table-only condition proves that two offsets suffice
  // for unique translated-section matching. If it fails, use all five
  // derivative signatures instead.
  fixedPairPassed = true;
  for (let base = 0; base < 32 && fixedPairPassed; base++) {
    for (let delta = 1; delta < 32; delta++) {
      const pair = table[base] ^ table[base ^ delta];
      const alongOne = pair ^ table[base ^ 1] ^ table[base ^ 1 ^ delta];
      const alongTwo = pair ^ table[base ^ 2] ^ table[base ^ 2 ^ delta];
      if (alongOne === 0 && alongTwo === 0) {
        fixedPairPassed = false;
        break;
      }
    }
  }

  /** @type {number[]} */
  const coordinates = [];
  /** @type {number[]} */
  const affineCorrections = [];
  if (fixedPairPassed) {
    coordinateStrategy = 'shift';
    for (let bit = 0; bit < n; bit++) {
      const basisVector = (2 ** bit) >>> 0;
      const f0 = ask(basisVector);
      const f1 = ask((basisVector ^ anchors[0]) >>> 0);
      const f2 = ask((basisVector ^ anchors[1]) >>> 0);
      let matchCount = 0;
      let matchedCoordinate = -1;
      let matchedCorrection = 0;
      for (let candidate = 0; candidate < 32; candidate++) {
        const correction = (f0 ^ table[candidate]) >>> 0;
        if (correction === ((f1 ^ table[candidate ^ 1]) >>> 0) &&
            correction === ((f2 ^ table[candidate ^ 2]) >>> 0)) {
          matchCount++;
          matchedCoordinate = candidate;
          matchedCorrection = correction;
        }
      }
      if (matchCount !== 1) {
        // Do not mix partial shift probes with the full signature path: route
        // this out-of-promise case directly to exact interpolation.
        return fallback('shift-coordinate-ambiguous',cache.size,0,0);
      }
      coordinates.push(matchedCoordinate);
      affineCorrections.push(matchedCorrection);
    }
  } else {
    coordinateStrategy = 'signature';
  }

  if (coordinateStrategy === 'signature') {
    // In a five-dimensional quotient, each signature coordinate is either
    // zero or the same nonzero witness vector.
    for (let bit = 0; bit < n; bit++) {
      const basisVector = (2 ** bit) >>> 0;
      let coordinate = 0;
      for (let omitted = 0; omitted < 5; omitted++) {
        const tuple = [basisVector,...anchors.filter((_,index) => index !== omitted)];
        const observed = fifthDerivative(tuple);
        if (observed !== 0 && observed !== witness) {
          return fallback('signature-outside-codimension-five-span',cache.size,0,0);
        }
        if (observed === witness) coordinate |= (1 << omitted);
      }
      coordinates.push(coordinate >>> 0);
    }

    // G(x)=H(q(x)) XOR Lx; choose L so G and F agree at each basis vector.
    for (let bit = 0; bit < n; bit++) {
      const basisVector = (2 ** bit) >>> 0;
      affineCorrections.push((ask(basisVector) ^ table[coordinates[bit]]) >>> 0);
    }
  }

  /** @type {ProjectedModel} */
  const model = {kind:'projected-affine',bits:n,rank:5,table,coordinates,affineCorrections};
  const fastQueries = cache.size;
  if (verificationMode === 'assume-projected-affine') {
    // Under F(x)=A(x) XOR b XOR h(Px), rank(P)=5 and a nonzero top
    // table coefficient, the recovered quotient coordinates are exact.
    // The section table plus basis-fitted linear correction therefore
    // reconstructs every input; no statistical verifier is required.
    // This mode is deliberately unsafe outside that explicit promise.
    return {
      model,
      queries:cache.size,
      diagnostics:{
        fastPathSuccess:true,
        witnessTrials,
        witnessTrialCap,
        witnessStrategy,
        witnessDrawCount:witnessTrials * directionCount,
        witnessProbability,
        witnessFailureBound:Math.pow(1-witnessProbability,witnessTrialCap),
        quotientRank:5,
        coordinateStrategy,
        fixedPairPassed,
        fastQueries,
        verificationQueries:0,
        verificationSamples:0,
        verificationCap:0,
        verificationDelta:null,
        falseAcceptanceBound:null,
        verificationPassed:null,
        verificationMode,
        promiseAssumed:true,
        fallbackUsed:false,
        fallbackReason:null,
        fallbackQueries:0,
        exactByInterpolation:false
      }
    };
  }
  onCandidateReady();
  const beforeVerification = cache.size;
  let verificationSamples = 0;
  for (let index = 0; index < verificationCap; index++) {
    const input = ((drawVerify() >>> 0) & inputMask) >>> 0;
    verificationSamples++;
    if (ask(input) !== evaluateHybridModel(model,input)) {
      return fallback('verification-mismatch',fastQueries,verificationSamples,cache.size-beforeVerification);
    }
  }
  const verificationQueries = cache.size-beforeVerification;
  return {
    model,
    queries:cache.size,
    diagnostics:{
      fastPathSuccess:true,
      witnessTrials,
      witnessTrialCap,
      witnessStrategy,
      witnessDrawCount:witnessTrials * directionCount,
      witnessProbability,
      witnessFailureBound:Math.pow(1-witnessProbability,witnessTrialCap),
      quotientRank:5,
      coordinateStrategy,
      fixedPairPassed,
      fastQueries,
      verificationQueries,
      verificationSamples,
      verificationCap,
      verificationDelta:delta,
      falseAcceptanceBound:delta,
      verificationPassed:true,
      verificationMode,
      promiseAssumed:false,
      fallbackUsed:false,
      fallbackReason:null,
      fallbackQueries:0,
      exactByInterpolation:false
    }
  };
}

/** @param {number} n @param {()=>number} draw @param {number[]|null} [tableOverride] @returns {(input:number)=>number} */
function makeRankFiveSource(n, draw, tableOverride=null) {
  const mask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {number[]} */
  const projections = [];
  while (projections.length < 5) {
    const candidate = (draw() & mask) >>> 0;
    if (vectorRank([...projections,candidate],n) > projections.length) projections.push(candidate);
  }
  const affine = Array.from({length:n},() => draw() >>> 0);
  const offset = draw() >>> 0;
  const table = tableOverride ? tableOverride.map(value=>value>>>0) :
    Array.from({length:32},() => draw() >>> 0);
  if (table.reduce((value,word)=>(value^word)>>>0,0) === 0) table[31] ^= 1;
  return input => {
    const x = (input & mask) >>> 0;
    let index = 0;
    for (let bit = 0; bit < 5; bit++) {
      if (parity32(x & projections[bit]) !== 0) index |= (1 << bit);
    }
    let result = offset;
    for (let bit = 0; bit < n; bit++) {
      if (((x >>> bit) & 1) !== 0) result ^= affine[bit];
    }
    return (result ^ table[index]) >>> 0;
  };
}

/** @returns {object} */
function main() {
  let positiveCases = 0;
  let positiveOutputs = 0;
  let maxPositiveQueries = 0;
  let totalPositiveQueries = 0;
  let shiftStrategyCases = 0;
  let signatureStrategyCases = 0;
  for (let n = 5; n <= 8; n++) {
    for (let caseIndex = 0; caseIndex < 8; caseIndex++) {
      const sourceRng = seeded(0x50a202611 + n * 100 + caseIndex);
      const source = makeRankFiveSource(n,sourceRng);
      const witnessRng = seeded(0x50a202621 + n * 100 + caseIndex);
      const verifyRng = seeded(0x50a202631 + n * 100 + caseIndex);
      const result = cloneTopDerivativeProjectedAffine(source,n,witnessRng,verifyRng);
      assert.equal(result.diagnostics.fastPathSuccess,true);
      assert.equal(result.diagnostics.fallbackUsed,false);
      assert.equal(result.diagnostics.verificationSamples,726);
      assert.equal(result.diagnostics.quotientRank,5);
      assert.ok(result.diagnostics.coordinateStrategy === 'shift' ||
        result.diagnostics.coordinateStrategy === 'signature');
      if (result.diagnostics.coordinateStrategy === 'shift') shiftStrategyCases++;
      else signatureStrategyCases++;
      for (let input = 0; input < 2 ** n; input++) {
        assert.equal(evaluateHybridModel(result.model,input),source(input),
          'rank-five projected-affine finite truth table mismatch');
        positiveOutputs++;
      }
      positiveCases++;
      totalPositiveQueries += result.queries;
      maxPositiveQueries = Math.max(maxPositiveQueries,result.queries);
    }
  }

  // Exercise the exact seven-direction, ten-face restart policy independently.
  let sevenDirectionPositiveCases = 0;
  let sevenDirectionPositiveOutputs = 0;
  let sevenDirectionMaxQueries = 0;
  for (let n = 5; n <= 8; n++) {
    for (let caseIndex = 0; caseIndex < 8; caseIndex++) {
      const source = makeRankFiveSource(
        n,seeded(0x50a202711 + n * 100 + caseIndex)
      );
      const result = cloneTopDerivativeProjectedAffine(
        source,n,
        seeded(0x50a202721 + n * 100 + caseIndex),
        seeded(0x50a202731 + n * 100 + caseIndex),
        1e-10,() => {},'seven-direction-restart'
      );
      assert.equal(result.diagnostics.witnessStrategy,'seven-direction-restart');
      assert.equal(result.diagnostics.witnessTrialCap,18);
      assert.equal(result.diagnostics.fastPathSuccess,true);
      assert.equal(result.diagnostics.fallbackUsed,false);
      assert.equal(result.diagnostics.witnessDrawCount,result.diagnostics.witnessTrials * 7);
      assert.equal(result.diagnostics.witnessProbability,24519915/33554432);
      assert.equal(result.diagnostics.witnessFailureBound,
        Math.pow(1-result.diagnostics.witnessProbability,result.diagnostics.witnessTrialCap));
      assert.ok(result.diagnostics.witnessTrials <= 18);
      assert.ok(result.diagnostics.witnessFailureBound <= 1e-10);
      assert.ok(result.queries <= 3375);
      for (let input = 0; input < 2 ** n; input++) {
        assert.equal(evaluateHybridModel(result.model,input),source(input),
          'seven-direction rank-five finite truth table mismatch');
        sevenDirectionPositiveOutputs++;
      }
      sevenDirectionPositiveCases++;
      sevenDirectionMaxQueries = Math.max(sevenDirectionMaxQueries,result.queries);
    }
  }

  // Exact projected-affine promise mode skips the statistical verifier.
  // Exercise both the fixed-pair shift branch and the derivative-signature
  // branch, with a verifier callback that fails if it is ever invoked.
  let promiseCases=0;
  let promiseOutputs=0;
  let promiseShiftCases=0;
  let promiseSignatureCases=0;
  let promiseMaxQueries=0;
  const promiseRandomSource=makeRankFiveSource(8,seeded(0x50a202781));
  const promiseMonomialTable=Array.from({length:32},(_,index)=>
    index===31?0x80000000:0);
  const promiseMonomialSource=makeRankFiveSource(
    8,seeded(0x50a202782),promiseMonomialTable
  );
  /** @type {Array<[(input:number)=>number,number,'shift'|'signature']>} */
  const promiseCasesToRun=[
    [promiseRandomSource,0x50a202783,'shift'],
    [promiseMonomialSource,0x50a202784,'signature']
  ];
  for(const [source,seed,expectedStrategy] of promiseCasesToRun) {
    let verifierCalls=0;
    let candidateReadyCalls=0;
    const promised=cloneTopDerivativeProjectedAffine(
      source,8,seeded(seed),
      () => {verifierCalls++;throw new Error('promise mode must not request verifier randomness');},
      1e-10,
      () => {candidateReadyCalls++;},
      'seven-direction-restart',
      'assume-projected-affine'
    );
    assert.equal(promised.diagnostics.verificationMode,'assume-projected-affine');
    assert.equal(promised.diagnostics.promiseAssumed,true);
    assert.equal(promised.diagnostics.verificationSamples,0);
    assert.equal(promised.diagnostics.verificationQueries,0);
    assert.equal(promised.diagnostics.verificationCap,0);
    assert.equal(promised.diagnostics.verificationPassed,null);
    assert.equal(promised.diagnostics.falseAcceptanceBound,null);
    assert.equal(promised.diagnostics.fallbackUsed,false);
    assert.equal(promised.diagnostics.fastPathSuccess,true);
    assert.equal(promised.diagnostics.coordinateStrategy,expectedStrategy);
    assert.equal(verifierCalls,0);
    assert.equal(candidateReadyCalls,0);
    if(expectedStrategy==='shift') {
      assert.equal(promised.diagnostics.fixedPairPassed,true);
      promiseShiftCases++;
    } else {
      assert.equal(promised.diagnostics.fixedPairPassed,false);
      promiseSignatureCases++;
    }
    for(let input=0;input<256;input++) {
      assert.equal(evaluateHybridModel(promised.model,input),source(input),
        'assumed projected-affine model differs on complete 8-bit domain');
      promiseOutputs++;
    }
    promiseCases++;
    promiseMaxQueries=Math.max(promiseMaxQueries,promised.queries);
  }

  // No-witness in promise mode still takes the exact interpolation fallback.
  // This is a pure-learner fallback test; the live HTTP adapter remains fast-path-only.
  let promiseNoWitnessVerifierCalls=0;
  let promiseNoWitnessReadyCalls=0;
  const promiseNoWitness=cloneTopDerivativeProjectedAffine(
    promiseRandomSource,8,
    () => 0,
    () => {promiseNoWitnessVerifierCalls++;throw new Error('no-witness promise fallback must not request verifier randomness');},
    1e-10,
    () => {promiseNoWitnessReadyCalls++;throw new Error('no-witness promise fallback must not announce a candidate');},
    'seven-direction-restart',
    'assume-projected-affine'
  );
  assert.equal(promiseNoWitness.diagnostics.witnessTrials,18);
  assert.equal(promiseNoWitness.diagnostics.witnessDrawCount,126);
  assert.equal(promiseNoWitness.diagnostics.fallbackReason,'no-witness-within-trial-cap');
  assert.equal(promiseNoWitness.diagnostics.fallbackUsed,true);
  assert.equal(promiseNoWitness.diagnostics.exactByInterpolation,true);
  assert.equal(promiseNoWitness.diagnostics.verificationSamples,0);
  assert.equal(promiseNoWitness.diagnostics.verificationQueries,0);
  assert.equal(promiseNoWitness.diagnostics.verificationPassed,null);
  assert.equal(promiseNoWitness.diagnostics.falseAcceptanceBound,null);
  assert.equal(promiseNoWitness.diagnostics.promiseAssumed,true);
  assert.equal(promiseNoWitnessVerifierCalls,0);
  assert.equal(promiseNoWitnessReadyCalls,0);
  for(let input=0;input<256;input++) {
    assert.equal(evaluateHybridModel(promiseNoWitness.model,input),promiseRandomSource(input),
      'assumed-promise no-witness interpolation fallback must remain exact');
  }

  // The lower-degree residual is deliberately outside the recovered quotient.
  const lowerRng = seeded(0x50a202641);
  const lowerBase = makeRankFiveSource(8,lowerRng);
  /** @param {number} input @returns {number} */
  const lowerResidual = input =>
    (lowerBase(input) ^ ((((input & 0x20) !== 0) && ((input & 0x40) !== 0)) ? 0x80000000 : 0)) >>> 0;
  const lowerFallback = cloneTopDerivativeProjectedAffine(
    lowerResidual,8,seeded(0x50a202642),seeded(0x50a202643)
  );
  assert.equal(lowerFallback.diagnostics.fallbackUsed,true);
  assert.ok(lowerFallback.diagnostics.fallbackReason === 'verification-mismatch' ||
    lowerFallback.diagnostics.fallbackReason === 'shift-coordinate-ambiguous');
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluateHybridModel(lowerFallback.model,input),lowerResidual(input));
  }

  // Silent rank-seven counterexample: signatures can look rank five, but the
  // independent RM(5,7) verifier must catch it and force exact interpolation.
  /** @param {number} input @returns {number} */
  const silentRankSeven = input => (
    ((((input & 31) === 31) ? 1 : 0) ^ (((input & 124) === 124) ? 2 : 0))
  ) >>> 0;
  const forcedDirections = [1,2,4,8,16,32];
  let witnessIndex = 0;
  const silentFallback = cloneTopDerivativeProjectedAffine(
    silentRankSeven,7,
    () => forcedDirections[witnessIndex++ % forcedDirections.length],
    () => 124
  );
  assert.equal(silentFallback.diagnostics.fallbackUsed,true);
  assert.ok(silentFallback.diagnostics.fallbackReason === 'verification-mismatch' ||
    silentFallback.diagnostics.fallbackReason === 'shift-coordinate-ambiguous' ||
    silentFallback.diagnostics.fallbackReason === 'signature-outside-codimension-five-span');
  assert.equal(silentFallback.model.kind,'anf');
  assert.equal(silentRankSeven(124),2);
  assert.equal(evaluateHybridModel(silentFallback.model,124),2);
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluateHybridModel(silentFallback.model,input),silentRankSeven(input));
  }

  // Explicitly demonstrate the promise boundary: the same rank-seven oracle
  // is intentionally mis-reconstructed if the caller lies and selects the
  // no-verifier projected-affine mode. The default verified mode above catches it.
  let unsafeWitnessIndex=0;
  let unsafeVerifierCalls=0;
  let unsafeCandidateReadyCalls=0;
  const unsafePromiseModel=cloneTopDerivativeProjectedAffine(
    silentRankSeven,7,
    () => forcedDirections[unsafeWitnessIndex++ % forcedDirections.length],
    () => {unsafeVerifierCalls++;throw new Error('invalid promise mode must not request verifier randomness');},
    1e-10,
    () => {unsafeCandidateReadyCalls++;},
    'six-direction',
    'assume-projected-affine'
  );
  assert.equal(unsafePromiseModel.diagnostics.promiseAssumed,true);
  assert.equal(unsafePromiseModel.diagnostics.verificationPassed,null);
  assert.equal(unsafePromiseModel.diagnostics.verificationSamples,0);
  assert.equal(unsafePromiseModel.diagnostics.fallbackUsed,false);
  assert.equal(unsafeVerifierCalls,0);
  assert.equal(unsafeCandidateReadyCalls,0);
  let promiseBoundaryMismatches=0;
  for(let input=0;input<128;input++) {
    if(evaluateHybridModel(unsafePromiseModel.model,input)!==silentRankSeven(input))
      promiseBoundaryMismatches++;
  }
  assert.ok(promiseBoundaryMismatches>0,
    'the no-verifier mode must not be mistaken for a general degree-five learner');

  // A sharper promise-boundary counterexample: the top fifth-derivative
  // form still has rank five, but a quadratic residual outside the quotient
  // invalidates the verifier-free shift identity.
  const boundaryTable=Array.from({length:32},(_,index)=>
    createHash('sha256').update('private-table-rank5/'+index).digest().readUInt32BE(0));
  boundaryTable[31]=(boundaryTable[31]^0x9765c3af)>>>0;
  const boundaryBeta=(boundaryTable[0]^boundaryTable[3]^boundaryTable[1]^boundaryTable[2])>>>0;
  assert.notEqual(boundaryBeta,0);
  const lowerResidualPromiseBoundary=input=>{
    const x=input&0xff;
    const lower=(((x>>>5)&1)!==0&&((x&1)^((x>>>1)&1))!==0)?boundaryBeta:0;
    return (x^0xd4c3b2a1^boundaryTable[x&31]^lower)>>>0;
  };
  const fixedAnchorDirections=[1,2,4,8,16,32,64];
  let boundaryWitnessIndex=0;
  const boundaryAssumed=cloneTopDerivativeProjectedAffine(
    lowerResidualPromiseBoundary,8,
    () => fixedAnchorDirections[boundaryWitnessIndex++%fixedAnchorDirections.length],
    () => {throw new Error('rank-five promise-boundary test must not verify');},
    1e-10,
    () => {throw new Error('rank-five promise-boundary test must not release verifier tape');},
    'seven-direction-restart',
    'assume-projected-affine'
  );
  assert.equal(boundaryAssumed.diagnostics.coordinateStrategy,'shift');
  assert.equal(boundaryAssumed.diagnostics.fixedPairPassed,true);
  assert.equal(boundaryAssumed.diagnostics.fallbackUsed,false);
  assert.equal(boundaryAssumed.model.coordinates[5],3);
  let rankFivePromiseBoundaryMismatches=0;
  for(let input=0;input<256;input++) {
    if(evaluateHybridModel(boundaryAssumed.model,input)!==lowerResidualPromiseBoundary(input))
      rankFivePromiseBoundaryMismatches++;
  }
  assert.equal(rankFivePromiseBoundaryMismatches,112,
    'the out-of-quotient quadratic residual should produce the pinned 112/256 mismatch count');

  let verifiedBoundaryWitnessIndex=0;
  const boundaryVerified=cloneTopDerivativeProjectedAffine(
    lowerResidualPromiseBoundary,8,
    () => fixedAnchorDirections[verifiedBoundaryWitnessIndex++%fixedAnchorDirections.length],
    seeded(0x50a202785),
    1e-10,
    () => {},
    'seven-direction-restart',
    'verify-degree-five'
  );
  assert.equal(boundaryVerified.diagnostics.fallbackReason,'verification-mismatch');
  assert.equal(boundaryVerified.diagnostics.fallbackUsed,true);
  assert.equal(boundaryVerified.diagnostics.exactByInterpolation,true);
  for(let input=0;input<256;input++) {
    assert.equal(evaluateHybridModel(boundaryVerified.model,input),lowerResidualPromiseBoundary(input),
      'default verified mode must catch the rank-five out-of-quotient residual');
  }

  // Codimension-six top derivative: a nonzero five-form can still produce a
  // witness, but its six-dimensional quotient cannot be represented by the
  // five-coordinate signature. The learner must fail closed to exact ANF.
  /** @param {number} input @returns {number} */
  const rankSix = input => (
    ((((input & 31) === 31) ? 1 : 0) ^
      (((input & 62) === 62) ? 2 : 0) ^
      (((input & 128) !== 0) ? 0x40000000 : 0))
  ) >>> 0;
  const rankSixDirections = [32,1,2,4,8,16];
  let rankSixWitnessIndex = 0;
  const rankSixFallback = cloneTopDerivativeProjectedAffine(
    rankSix,8,
    () => rankSixDirections[rankSixWitnessIndex++ % rankSixDirections.length],
    () => 0
  );
  assert.equal(rankSixFallback.diagnostics.fallbackUsed,true);
  assert.ok(rankSixFallback.diagnostics.fallbackReason === 'signature-outside-codimension-five-span' ||
    rankSixFallback.diagnostics.fallbackReason === 'verification-mismatch' ||
    rankSixFallback.diagnostics.fallbackReason === 'shift-coordinate-ambiguous');
  assert.equal(rankSixFallback.model.kind,'anf');
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluateHybridModel(rankSixFallback.model,input),rankSix(input));
  }

  // A structured monomial table fails the fixed-pair check, so the learner
  // must retain the derivative-signature route and still reconstruct exactly.
  /** @param {number} input @returns {number} */
  const monomialTableSource = input =>
    ((input & 31) === 31 ? 0x80000000 : 0) >>> 0;
  const monomialDirections = [1,2,4,8,16,32];
  let monomialWitnessIndex = 0;
  const monomialSignature = cloneTopDerivativeProjectedAffine(
    monomialTableSource,8,
    () => monomialDirections[monomialWitnessIndex++ % monomialDirections.length],
    seeded(0x50a202650)
  );
  assert.equal(monomialSignature.diagnostics.fixedPairPassed,false);
  assert.equal(monomialSignature.diagnostics.coordinateStrategy,'signature');
  assert.equal(monomialSignature.diagnostics.fastPathSuccess,true);
  assert.equal(monomialSignature.diagnostics.fallbackUsed,false);
  assert.ok(monomialSignature.queries <= 63 + 62 * 26 + 31 * 8 + 726);
  for (let input = 0; input < 256; input++) {
    assert.equal(evaluateHybridModel(monomialSignature.model,input),monomialTableSource(input));
  }

  // A degree-four source has no fifth-derivative witness and uses exact fallback.
  /** @param {number} input @returns {number} */
  const degreeFour = input => (
    ((((input & 15) === 15) ? 0x80000000 : 0) ^ ((input & 0x20) ? 0x12345678 : 0))
  ) >>> 0;
  const noWitness = cloneTopDerivativeProjectedAffine(
    degreeFour,7,seeded(0x50a202651),seeded(0x50a202652)
  );
  assert.equal(noWitness.diagnostics.fallbackUsed,true);
  assert.equal(noWitness.diagnostics.fallbackReason,'no-witness-within-trial-cap');
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluateHybridModel(noWitness.model,input),degreeFour(input));
  }

  const noWitnessSeven = cloneTopDerivativeProjectedAffine(
    degreeFour,7,seeded(0x50a202661),seeded(0x50a202662),
    1e-10,() => {},'seven-direction-restart'
  );
  assert.equal(noWitnessSeven.diagnostics.witnessStrategy,'seven-direction-restart');
  assert.equal(noWitnessSeven.diagnostics.fallbackUsed,true);
  assert.equal(noWitnessSeven.diagnostics.fallbackReason,'no-witness-within-trial-cap');
  assert.equal(noWitnessSeven.diagnostics.witnessTrials,18);
  assert.equal(noWitnessSeven.diagnostics.witnessDrawCount,126);
  assert.equal(noWitnessSeven.diagnostics.witnessFailureBound,
    Math.pow(1-noWitnessSeven.diagnostics.witnessProbability,
      noWitnessSeven.diagnostics.witnessTrialCap));
  for (let input = 0; input < 128; input++) {
    assert.equal(evaluateHybridModel(noWitnessSeven.model,input),degreeFour(input));
  }

  const summary = {
    promiseBoundary:{
      rankSeven:{outsidePromise:'silent-rank-seven',mismatches:promiseBoundaryMismatches,outputs:128,verifierSamples:0},
      rankFiveLowerResidual:{fixedPairPassed:true,coordinateForE5:3,mismatches:rankFivePromiseBoundaryMismatches,outputs:256,verifiedFallbackReason:boundaryVerified.diagnostics.fallbackReason,verifiedFallbackExact:true},
      expectedUnsafe:true
    },
    promiseNoWitnessFallback:{
      trials:promiseNoWitness.diagnostics.witnessTrials,
      witnessDraws:promiseNoWitness.diagnostics.witnessDrawCount,
      fallbackReason:promiseNoWitness.diagnostics.fallbackReason,
      exactByInterpolation:promiseNoWitness.diagnostics.exactByInterpolation,
      verifierSamples:0,
      verifierCalls:promiseNoWitnessVerifierCalls,
      candidateReadyCalls:promiseNoWitnessReadyCalls,
      exactAll256:true
    },
    promisedProjectedAffine:{
      cases:promiseCases,
      outputs:promiseOutputs,
      shiftCases:promiseShiftCases,
      signatureCases:promiseSignatureCases,
      maxQueries:promiseMaxQueries,
      verifierSamples:0,
      verifierCallbackCalls:0,
      exactAll256:true
    },
    sevenDirectionRestart:{
      cases:sevenDirectionPositiveCases,
      outputs:sevenDirectionPositiveOutputs,
      maxQueries:sevenDirectionMaxQueries,
      noWitnessFallbackExactAll128:true,
      noWitnessTrials:noWitnessSeven.diagnostics.witnessTrials
    },
    finite:{cases:positiveCases,outputs:positiveOutputs,
      meanQueries:totalPositiveQueries/positiveCases,maxQueries:maxPositiveQueries,
      shiftStrategyCases,signatureStrategyCases},
    monomialSignatureFallback:{
      fixedPairPassed:monomialSignature.diagnostics.fixedPairPassed,
      coordinateStrategy:monomialSignature.diagnostics.coordinateStrategy,
      exactAll256:true,
      queries:monomialSignature.queries
    },
    lowerDegreeResidualFallback:{
      reason:lowerFallback.diagnostics.fallbackReason,
      exactAll256:true,
      queries:lowerFallback.queries
    },
    silentRankSevenFallback:{
      reason:silentFallback.diagnostics.fallbackReason,
      exactAll128:true,
      witnessDraws:witnessIndex
    },
    degreeFourFallback:{
      reason:noWitness.diagnostics.fallbackReason,
      exactAll128:true,
      queries:noWitness.queries
    },
    rankSixFallback:{
      reason:rankSixFallback.diagnostics.fallbackReason,
      exactAll256:true,
      witnessDraws:rankSixWitnessIndex
    },
    bounds:{
      witnessProbability:Math.pow(63/64,1)*Math.pow(62/64,1)*Math.pow(60/64,1)*Math.pow(56/64,1)*Math.pow(48/64,1),
      witnessTrialCap:Math.ceil(Math.log(1e-10)/Math.log(1-((63/64)*(62/64)*(60/64)*(56/64)*(48/64)))),
      verificationSamples:Math.ceil(Math.log(1e-10)/Math.log(31/32)),
      falseAcceptanceBound:Math.pow(31/32,Math.ceil(Math.log(1e-10)/Math.log(31/32))),
      lazySignatureCapN32:63+62*26+31*32+726,
      shiftCapN32:63+62*26+3*32+726
    },
    note:'Seeded tests exercise implementation paths only. The default RM verifier guarantee requires independent uniform verification draws and a fixed degree<=5 oracle. The opt-in assume-projected-affine mode skips verification and is exact only under its explicit F=A+b+h(Px), rank-five, nonzero-top-coefficient promise. Deliberate silent-rank-seven and rank-five out-of-quotient quadratic-residual misuse tests confirm that this mode can return wrong models outside that promise; the default verified mode catches both.'
  };
  console.log('TOP_DERIVATIVE_PROJECTED_AFFINE_HYBRID ' + JSON.stringify(summary));
  return summary;
}

if (require.main === module) main();
module.exports = {
  cloneTopDerivativeProjectedAffine,
  evaluateHybridModel,
  exactDegreeFiveModel,
  makeRankFiveSource,
  main
};
