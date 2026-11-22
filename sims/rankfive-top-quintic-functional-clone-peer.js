'use strict';

const assert = require('node:assert/strict');
const {createHash, randomBytes} = require('node:crypto');

/** @typedef {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5,queries:number,trials:number,quotientRank:number,trialCap:number}} Model */

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

/** @param {number[]} rows @param {number} width @returns {number} */
function binaryRowRank(rows, width) {
  const pivots = Array(width).fill(0);
  let rank = 0;
  for (let row of rows) {
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((row >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) row ^= pivots[bit];
      else {
        pivots[bit] = row;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/** @param {number[]} coordinates @param {number[]} selected @returns {boolean} */
function determinantFive(coordinates, selected) {
  const rows = coordinates.map(value => {
    let row = 0;
    for (let column = 0; column < 5; column++) {
      row |= ((value >>> selected[column]) & 1) << column;
    }
    return row;
  });
  return binaryRowRank(rows, 5) === 5;
}

/** @param {number[]} words @returns {bigint} */
function packSignature(words) {
  let packed = 0n;
  for (let i = 0; i < 5; i++) {
    packed |= BigInt(words[i] >>> 0) << BigInt(32 * i);
  }
  return packed;
}

/** @param {bigint[]} basis @returns {Map<bigint,number>} */
function spanCoordinates(basis) {
  /** @type {Map<bigint,number>} */
  const table = new Map([[0n, 0]]);
  for (let i = 0; i < basis.length; i++) {
    const existing = Array.from(table.entries());
    for (const [value, coordinates] of existing) {
      table.set(value ^ basis[i], coordinates ^ (1 << i));
    }
  }
  return table;
}

/** @param {number} n @param {number} mask @returns {number[]} */
function bitIndices(n, mask) {
  /** @type {number[]} */
  const result = [];
  for (let bit = 0; bit < n; bit++) {
    if (((mask >>> bit) & 1) !== 0) result.push(bit);
  }
  return result;
}

/**
 * Independently reconstructs a fixed degree<=5 vector-valued Boolean
 * function when the joint radical of its fifth derivative has codimension
 * at most six. The random-word callback must produce independent uniform
 * uint32 values for the stated probability bound; tests inject a seeded
 * generator only for deterministic reproduction.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} draw
 * @param {number} [delta]
 * @returns {Model}
 */
function cloneTopQuintic(oracle, n, draw = secureWord, delta = 1e-10) {
  assert.ok(Number.isInteger(n) && n >= 5 && n <= 32);
  assert.ok(Number.isFinite(delta) && delta > 0 && delta < 1);
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  function ask(input) {
    const key = ((input & inputMask) >>> 0);
    if (!cache.has(key)) cache.set(key, oracle(key) >>> 0);
    return /** @type {number} */ (cache.get(key));
  }

  // Degree-five terms vanish on inputs of Hamming weight <=4. Therefore
  // these values determine all lower ANF coefficients without knowing T5.
  /** @type {Map<number,number>} */
  const lowerCoefficients = new Map();
  for (let weight = 0; weight <= 4; weight++) {
    for (const input of masksOfWeight(n, weight)) {
      let coefficient = ask(input);
      if (input !== 0) {
        for (let subset = ((input - 1) & input); ; subset = ((subset - 1) & input)) {
          coefficient ^= /** @type {number} */ (lowerCoefficients.get(subset >>> 0));
          if (subset === 0) break;
        }
      }
      lowerCoefficients.set(input >>> 0, coefficient >>> 0);
    }
  }

  /** @param {number[]} directions @returns {number} */
  function fifthDerivative(directions) {
    let result = 0;
    for (let subset = 0; subset < 32; subset++) {
      let input = 0;
      for (let j = 0; j < 5; j++) {
        if (((subset >>> j) & 1) !== 0) input ^= directions[j];
      }
      result ^= ask(input >>> 0);
    }
    return result >>> 0;
  }

  const witnessProbability = (31 / 32) * (30 / 32) * (28 / 32) * (24 / 32) * (16 / 32);
  const trialCap = Math.ceil(Math.log(delta) / Math.log(1 - witnessProbability));
  /** @type {number[]} */
  let anchors = [];
  let witness = 0;
  let trials = 0;
  for (; trials < trialCap; trials++) {
    const tuple = Array.from({length: 5}, () => ((draw() >>> 0) & inputMask) >>> 0);
    const observed = fifthDerivative(tuple);
    if (observed !== 0) {
      anchors = tuple;
      witness = observed;
      trials++;
      break;
    }
  }

  if (witness === 0) {
    const lower = Array.from(lowerCoefficients.entries()).filter(([,value]) => value !== 0);
    assert.ok(cache.size <= masksThroughWeight(n, 4).length + 31 * trialCap);
    return {bits:n, lower, top:[], degree:4, queries:cache.size,
      trials, quotientRank:0, trialCap};
  }

  /** @param {number} input @returns {bigint} */
  function signature(input) {
    /** @type {number[]} */
    const words = [];
    for (let omitted = 0; omitted < 5; omitted++) {
      const directions = [input];
      for (let j = 0; j < 5; j++) if (j !== omitted) directions.push(anchors[j]);
      words.push(fifthDerivative(directions));
    }
    return packSignature(words);
  }

  const anchorSignatures = Array.from({length:5}, (_,i) => BigInt(witness) << BigInt(32 * i));
  const observedSignatures = Array.from({length:n}, (_,i) => signature((2 ** i) >>> 0));
  const anchorSpan = spanCoordinates(anchorSignatures);
  const extraIndex = observedSignatures.findIndex(value => !anchorSpan.has(value));
  /** @type {bigint[]} */
  const signatureBasis = anchorSignatures.slice();
  if (extraIndex >= 0) signatureBasis.push(observedSignatures[extraIndex]);
  assert.ok(signatureBasis.length === 5 || signatureBasis.length === 6);
  const coordinatesTable = spanCoordinates(signatureBasis);
  assert.equal(coordinatesTable.size, 2 ** signatureBasis.length);
  const coordinates = observedSignatures.map(value => {
    const result = coordinatesTable.get(value);
    assert.notEqual(result, undefined, 'fifth-derivative radical codimension exceeds six');
    return /** @type {number} */ (result);
  });

  const quotientRank = signatureBasis.length;
  /** @type {number[]} */
  const gramByOmittedIndex = [];
  if (quotientRank === 5) {
    gramByOmittedIndex.push(witness);
  } else {
    assert.ok(extraIndex >= 0);
    const pivot = observedSignatures[extraIndex];
    for (let omitted = 0; omitted < 5; omitted++) {
      gramByOmittedIndex[omitted] = Number((pivot >> BigInt(32 * omitted)) & 0xffffffffn) >>> 0;
    }
    gramByOmittedIndex[5] = witness;
  }

  /** @param {number[]} inputCoordinates @returns {number} */
  function reconstructTopCoefficient(inputCoordinates) {
    if (quotientRank === 5) {
      return determinantFive(inputCoordinates, [0,1,2,3,4]) ? witness : 0;
    }
    let result = 0;
    for (let omitted = 0; omitted < 6; omitted++) {
      /** @type {number[]} */
      const selected = [];
      for (let bit = 0; bit < 6; bit++) if (bit !== omitted) selected.push(bit);
      if (determinantFive(inputCoordinates, selected)) result ^= gramByOmittedIndex[omitted];
    }
    return result >>> 0;
  }

  /** @type {Array<[number,number]>} */
  const topCoefficients = [];
  for (const support of masksOfWeight(n, 5)) {
    const sourceIndices = bitIndices(n, support);
    const inputCoordinates = sourceIndices.map(index => coordinates[index]);
    const coefficient = reconstructTopCoefficient(inputCoordinates);
    if (coefficient !== 0) topCoefficients.push([support >>> 0, coefficient >>> 0]);
  }

  const lower = Array.from(lowerCoefficients.entries()).filter(([,value]) => value !== 0);
  const queryCap = masksThroughWeight(n, 4).length + 31 * trialCap + 30 * n;
  assert.ok(cache.size <= queryCap, 'fifth-derivative clone exceeded its distinct-query cap');
  return {bits:n, lower, top:topCoefficients, degree:5, queries:cache.size,
    trials, quotientRank, trialCap};
}

/** @param {Model} model @param {number} input @returns {number} */
function evaluateClone(model, input) {
  const mask = model.bits === 32 ? 0xffffffff : (2 ** model.bits - 1);
  const x = (input & mask) >>> 0;
  let result = 0;
  for (const [support, coefficient] of model.lower) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  for (const [support, coefficient] of model.top) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  return result >>> 0;
}

/** @param {number} n @param {()=>number} draw @returns {number[]} */
function randomIndependentVectors(n, draw) {
  /** @type {number[]} */
  const basis = [];
  while (basis.length < n) {
    const candidate = draw() >>> 0;
    if (vectorRank([...basis, candidate], n) > basis.length) basis.push(candidate);
  }
  return basis;
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

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let result = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if (((input >>> bit) & 1) !== 0) result ^= columns[bit];
  }
  return result >>> 0;
}

/** @param {number} n @param {()=>number} draw @param {5|6} projectionRank @param {boolean} topActive @param {number} lowerTermsPerDegree @returns {(x:number)=>number} */
function makeSource(n, draw, projectionRank, topActive, lowerTermsPerDegree) {
  const inputMask = n === 32 ? 0xffffffff : (2 ** n - 1);
  const affine = randomIndependentVectors(n, draw);
  const projections = randomIndependentVectors(projectionRank, draw);
  const offset = draw() & inputMask;
  /** @type {Array<[number,number]>} */
  const lowerTerms = [];
  for (let degree = 2; degree <= 4; degree++) {
    const available = masksOfWeight(n, degree);
    /** @type {Set<number>} */
    const chosen = new Set();
    while (chosen.size < Math.min(lowerTermsPerDegree, available.length)) {
      chosen.add(available[draw() % available.length]);
    }
    for (const support of chosen) lowerTerms.push([support, draw() & inputMask]);
  }
  /** @type {Array<[number,number]>} */
  const topTerms = [];
  if (topActive) {
    if (projectionRank === 5) {
      topTerms.push([31, draw() || 1]);
    } else {
      const outputBasis = randomIndependentVectors(6, draw);
      for (let omitted = 0; omitted < 6; omitted++) {
        topTerms.push([63 ^ (1 << omitted), outputBasis[omitted]]);
      }
    }
  }
  return input => {
    const x = (input & inputMask) >>> 0;
    let result = offset ^ applyLinear(affine, x);
    for (const [support, coefficient] of lowerTerms) {
      if (((x & support) >>> 0) === support) result ^= coefficient;
    }
    let projected = 0;
    for (let bit = 0; bit < projections.length; bit++) {
      if (parity32(x & projections[bit])) projected |= (1 << bit);
    }
    for (const [support, coefficient] of topTerms) {
      if ((projected & support) === support) result ^= coefficient;
    }
    return (result & inputMask) >>> 0;
  };
}

/** @returns {{width:number,topCoefficients:number,outputRank:number,rejected:boolean}} */
function rankSevenPromiseViolation() {
  const width = 7;
  /** @type {Array<[number,number]>} */
  const terms = [];
  for (const [index, support] of masksOfWeight(width, 5).entries()) {
    terms.push([support, 2 ** index]);
  }
  assert.equal(terms.length, 21);
  assert.equal(vectorRank(terms.map(([,value]) => value), 32), 21);
  /** @param {number} input @returns {number} */
  const source = input => {
    let result = 0;
    for (const [support, coefficient] of terms) {
      if ((input & support) === support) result ^= coefficient;
    }
    return result >>> 0;
  };
  const forcedBasisWitness = [1, 2, 4, 8, 16];
  let drawIndex = 0;
  assert.throws(() => cloneTopQuintic(source, width,
    () => forcedBasisWitness[drawIndex++ % forcedBasisWitness.length]),
  /fifth-derivative radical codimension exceeds six/);
  return {width,topCoefficients:terms.length,outputRank:21,rejected:true};
}

/** @returns {object} */
function main() {
  const sourceRng = seeded(0x5a202611);
  let finiteCases = 0;
  let finiteOutputs = 0;
  let finiteTop5 = 0;
  let finiteTop6 = 0;
  let finiteFallback = 0;
  let finiteMaxQueries = 0;
  for (let n = 5; n <= 8; n++) {
    for (let caseIndex = 0; caseIndex < 12; caseIndex++) {
      const projectionRank = n >= 6 && caseIndex % 3 === 1 ? 6 : 5;
      const topActive = caseIndex % 4 !== 0;
      const source = makeSource(n, sourceRng, projectionRank, topActive, 4);
      const learnerRng = seeded(sourceRng());
      let online = true;
      let calls = 0;
      const model = cloneTopQuintic(input => {
        if (!online) throw new Error('finite offline model queried the protected oracle');
        calls++;
        return source(input);
      }, n, learnerRng);
      online = false;
      assert.equal(calls, model.queries);
      for (let input = 0; input < 2 ** n; input++) {
        assert.equal(evaluateClone(model, input), source(input),
          `finite mismatch n=${n}, case=${caseIndex}, input=${input}`);
        finiteOutputs++;
      }
      if (model.degree === 5) {
        if (model.quotientRank === 5) finiteTop5++;
        else finiteTop6++;
      } else finiteFallback++;
      finiteCases++;
      finiteMaxQueries = Math.max(finiteMaxQueries, calls);
    }
  }

  const wideRng = seeded(0x5a202612);
  let wideCases = 0;
  let wideHeldouts = 0;
  let wideMaxQueries = 0;
  let wideMaxTopTerms = 0;
  for (let caseIndex = 0; caseIndex < 8; caseIndex++) {
    const projectionRank = caseIndex % 2 === 0 ? 5 : 6;
    const topActive = caseIndex % 4 !== 3;
    const source = makeSource(32, wideRng, projectionRank, topActive, 72);
    const learnerRng = seeded(wideRng());
    let online = true;
    let calls = 0;
    const model = cloneTopQuintic(input => {
      if (!online) throw new Error('wide offline model queried the protected oracle');
      calls++;
      return source(input);
    }, 32, learnerRng);
    online = false;
    assert.equal(calls, model.queries);
    assert.ok(calls <= 44455, `query cap exceeded: ${calls}`);
    if (topActive) assert.equal(model.degree, 5);
    else assert.equal(model.degree, 4);
    for (let sample = 0; sample < 128; sample++) {
      const input = wideRng() >>> 0;
      assert.equal(evaluateClone(model, input), source(input),
        `wide mismatch case=${caseIndex}, sample=${sample}`);
      wideHeldouts++;
    }
    wideCases++;
    wideMaxQueries = Math.max(wideMaxQueries, calls);
    wideMaxTopTerms = Math.max(wideMaxTopTerms, model.top.length);
  }

  const rankSevenControl = rankSevenPromiseViolation();
  const summary = {
    seed:'0x5a202611',
    promise:'fixed degree<=5, fifth-derivative joint-radical codimension<=6',
    finite:{cases:finiteCases,outputs:finiteOutputs,topRank5:finiteTop5,
      topRank6:finiteTop6,degree4Fallback:finiteFallback,maxQueries:finiteMaxQueries},
    width32:{cases:wideCases,heldouts:wideHeldouts,maxQueries:wideMaxQueries,
      maxTopCoefficients:wideMaxTopTerms,hardCap:44455,trialCap:66},
    rankSevenPromiseViolation:rankSevenControl,
    note:'Seeded tests validate implementation only; the 1e-10 failure bound requires independent uniform draws and the stated source promise'
  };
  console.log('TOP_QUINTIC_OFFLINE_FUNCTION_CLONE ' + JSON.stringify(summary));
  return summary;
}

if (require.main === module) main();
module.exports = {cloneTopQuintic,evaluateClone,main,rankSevenPromiseViolation};
