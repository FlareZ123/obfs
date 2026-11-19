'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {transformSync} = require('esbuild');
const {recover} = require('./mba-author-int32-minified-recover');
const {recoverDataflow} = require('./mba-author-int32-dataflow-recover');
const {
  forwardChain32,
  inverseChain32
} = require('./mba-author-int32-component-inverse');

const ATTACKER_COMMIT = '95758eb71d69f7ebc6b24816fa9b5bb3665d4083';
const ATTACKER_BLOB = 'fbb449a7da43612d153af5244d42b036ec2bd0a7';
const SEED = 'heldout-after-seed-expander-freeze:2026-11-19:agent7:mba-seed-expanded:v1';

class HashStream {
  /** @param {string} seed */
  constructor(seed) {
    this.seed = seed;
    this.counter = 0;
  }

  /** @returns {number} */
  word() {
    return createHash('sha256')
      .update(this.seed)
      .update(':')
      .update(String(this.counter++))
      .digest()
      .readUInt32LE(0);
  }
}

/**
 * @param {number} state
 * @param {number} multiplier
 * @param {number} increment
 * @returns {number}
 */
function lcgStep(state, multiplier, increment) {
  return (Math.imul(state, multiplier) + increment) >>> 0;
}

/**
 * @param {number} seed
 * @param {number} roundCount
 * @param {number} xorCount
 * @param {number} rotationCount
 * @param {number} lcgMultiplier
 * @param {number} increment
 * @returns {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>}
 */
function expandRounds(seed, roundCount, xorCount, rotationCount, lcgMultiplier, increment) {
  let state = seed >>> 0;
  const rounds = [];
  for (let index = 0; index < roundCount; index++) {
    state = lcgStep(state, lcgMultiplier, increment);
    const additive = state;
    state = lcgStep(state, lcgMultiplier, increment);
    const coefficient = (state * 2 + 1) >>> 0;
    state = lcgStep(state, lcgMultiplier, increment);
    const shiftBase = (state >>> 28) + 1;
    state = lcgStep(state, lcgMultiplier, increment);
    const rotationBase = (state >>> 30) + 1;
    rounds.push({
      coefficients:[additive, coefficient],
      xorShifts:xorCount === 1 ? [shiftBase] : [shiftBase, shiftBase + 15],
      cyclicShifts:rotationCount === 3 ?
        [rotationBase, rotationBase + 5, rotationBase + 11] :
        [rotationBase, rotationBase + 5, rotationBase + 11,
          rotationBase + 17, rotationBase + 23]
    });
  }
  return rounds;
}

/**
 * @param {number} seed
 * @param {number} roundCount
 * @param {number} xorCount
 * @param {number} rotationCount
 * @param {number} lcgMultiplier
 * @param {number} increment
 * @param {number} target
 * @param {number} variant
 * @param {number} splitConstant
 * @returns {string}
 */
function sourceFor(
  seed,
  roundCount,
  xorCount,
  rotationCount,
  lcgMultiplier,
  increment,
  target,
  variant,
  splitConstant
) {
  const useAlias = (variant & 1) !== 0;
  const reverseImul = (variant & 2) !== 0;
  const splitIncrement = (variant & 4) !== 0;
  const arrowRotation = (variant & 8) !== 0;
  const reverseXor = (variant & 16) !== 0;
  const reverseRotations = (variant & 32) !== 0;
  const reverseComparison = (variant & 64) !== 0;
  const separateLoopInit = (variant & 128) !== 0;

  const incrementLeft = splitConstant >>> 0;
  const incrementRight = (increment - incrementLeft) >>> 0;
  const incrementExpression = splitIncrement ? '(ia+ib)' : 'inc';
  const imulName = useAlias ? 'mul' : 'Math.imul';
  const product = reverseImul ?
    imulName + '(lm,s)' :
    imulName + '(s,lm)';
  const advance = 's=(' + product + '+' + incrementExpression + ')>>>0;';

  const lines = [
    "'use strict';",
    arrowRotation ?
      'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);' :
      'function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}',
    'module.exports=function predicate(input){'
  ];
  if (useAlias) lines.push('const mul=Math.imul;');
  lines.push('const lm=' + String(lcgMultiplier >>> 0) + ';');
  if (splitIncrement) {
    lines.push('const ia=' + String(incrementLeft) + ',ib=' + String(incrementRight) + ';');
  } else {
    lines.push('const inc=' + String(increment >>> 0) + ';');
  }
  lines.push('const n=' + String(roundCount) + ';');
  lines.push('let x=input>>>0,s=' + String(seed >>> 0) + ';');
  if (separateLoopInit) {
    lines.push('let i=0;');
    lines.push('for(;i<n;i+=1){');
  } else {
    lines.push('for(let i=0;i<n;i++){');
  }

  lines.push(advance);
  lines.push('const add=s;');
  lines.push(advance);
  lines.push('const coeff=(s*2+1)>>>0;');
  lines.push(advance);
  lines.push('const sh=(s>>>28)+1;');
  lines.push(advance);
  lines.push('const rb=(s>>>30)+1;');

  const roundProduct = reverseImul ?
    (useAlias ? 'mul(x,coeff)' : 'Math.imul(x,coeff)') :
    (useAlias ? 'mul(coeff,x)' : 'Math.imul(coeff,x)');
  lines.push('const p=(add^' + roundProduct + ')>>>0;');

  let xorTerms = ['p', '(p>>>sh)'];
  if (xorCount === 2) xorTerms.push('(p>>>(sh+15))');
  if (reverseXor) xorTerms = xorTerms.reverse();
  lines.push('const q=(' + xorTerms.join('^') + ')>>>0;');

  const offsets = rotationCount === 3 ? [0, 5, 11] : [0, 5, 11, 17, 23];
  let rotationTerms = offsets.map(offset =>
    'rot(q,' + (offset === 0 ? 'rb' : 'rb+' + String(offset)) + ')'
  );
  if (reverseRotations) rotationTerms = rotationTerms.reverse();
  lines.push('x=(' + rotationTerms.join('^') + ')>>>0;');
  lines.push('}');
  lines.push(reverseComparison ?
    'return ' + String(target >>> 0) + '===x;' :
    'return x===' + String(target >>> 0) + ';');
  lines.push('};');
  return lines.join('\n');
}

/**
 * @returns {{
 *   attackerCommit:string,
 *   attackerBlob:string,
 *   seed:string,
 *   cases:number,
 *   oneRoundCases:number,
 *   twoRoundCases:number,
 *   oldSyntaxRejections:number,
 *   exactParameterRecoveries:number,
 *   exactPreimages:number,
 *   maxRecoveryMs:number,
 *   records:Array<Record<string,unknown>>
 * }}
 */
function runHeldoutRecovery() {
  const stream = new HashStream(SEED);
  /** @type {Array<Record<string,unknown>>} */
  const records = [];

  for (let index = 0; index < 32; index++) {
    const roundCount = (index & 1) + 1;
    const xorCount = (index & 2) === 0 ? 1 : 2;
    const rotationCount = (index & 4) === 0 ? 3 : 5;
    const publicSeed = stream.word();
    const lcgMultiplier = (stream.word() | 1) >>> 0;
    const increment = stream.word();
    const splitConstant = stream.word();
    const variant = stream.word();
    const rounds = expandRounds(
      publicSeed,
      roundCount,
      xorCount,
      rotationCount,
      lcgMultiplier,
      increment
    );
    const secret = stream.word();
    const target = forwardChain32(secret, rounds);
    const source = sourceFor(
      publicSeed,
      roundCount,
      xorCount,
      rotationCount,
      lcgMultiplier,
      increment,
      target,
      variant,
      splitConstant
    );
    const minified = transformSync(source, {
      loader:'js',
      format:'cjs',
      target:'es2022',
      minify:true,
      legalComments:'none'
    }).code;

    let oldSyntaxRejected = false;
    try {
      recover(minified);
    } catch (error) {
      assert.match(
        String(error),
        /author-style loop or target not found|round bound not found|literal round count not found|round parameters not structurally recoverable/
      );
      oldSyntaxRejected = true;
    }
    assert.equal(oldSyntaxRejected, true);

    const started = performance.now();
    const recovered = recoverDataflow(minified);
    const recoveryMs = performance.now() - started;

    assert.equal(recovered.inputIndex, 0);
    assert.equal(recovered.target, target);
    assert.deepEqual(recovered.rounds, rounds);
    assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);

    records.push({
      index,
      roundCount,
      xorCount,
      rotationCount,
      minifiedBytes:Buffer.byteLength(minified),
      recoveryMs,
      oldSyntaxRejected,
      exactParameters:true,
      exactPreimage:true
    });
  }

  return {
    attackerCommit:ATTACKER_COMMIT,
    attackerBlob:ATTACKER_BLOB,
    seed:SEED,
    cases:records.length,
    oneRoundCases:records.filter(record => record.roundCount === 1).length,
    twoRoundCases:records.filter(record => record.roundCount === 2).length,
    oldSyntaxRejections:records.filter(record => record.oldSyntaxRejected === true).length,
    exactParameterRecoveries:records.filter(record => record.exactParameters === true).length,
    exactPreimages:records.filter(record => record.exactPreimage === true).length,
    maxRecoveryMs:Math.max(...records.map(record => Number(record.recoveryMs))),
    records
  };
}

/** @param {number} input @param {number} roundCount @returns {number} */
function seededTransform32(input, roundCount) {
  let x = input >>> 0;
  let state = 0x6a09e667;
  const lcgMultiplier = 1664525;
  const increment = 1013904223;
  for (let round = 0; round < roundCount; round++) {
    state = (Math.imul(state, lcgMultiplier) + increment) >>> 0;
    const additive = state;
    state = (Math.imul(state, lcgMultiplier) + increment) >>> 0;
    const coefficient = (state * 2 + 1) >>> 0;
    state = (Math.imul(state, lcgMultiplier) + increment) >>> 0;
    const shiftBase = (state >>> 28) + 1;
    state = (Math.imul(state, lcgMultiplier) + increment) >>> 0;
    const rotationBase = (state >>> 30) + 1;

    x = (additive ^ Math.imul(coefficient, x)) >>> 0;
    x = (x ^ (x >>> shiftBase) ^ (x >>> (shiftBase + 15))) >>> 0;
    x = (
      ((x << rotationBase) | (x >>> (32 - rotationBase))) ^
      ((x << (rotationBase + 5)) | (x >>> (27 - rotationBase))) ^
      ((x << (rotationBase + 11)) | (x >>> (21 - rotationBase)))
    ) >>> 0;
  }
  return x;
}

/** @param {number} code @returns {boolean} */
function nativePredicate(code) {
  return code === 47;
}

/** @param {number} roundCount @returns {(code:number)=>boolean} */
function protectedPredicate(roundCount) {
  const target = seededTransform32(47, roundCount);
  return code => seededTransform32(code, roundCount) === target;
}

/** @param {(code:number)=>boolean} predicate @param {number} count @returns {number} */
function work(predicate, count) {
  let hits = 0;
  for (let index = 0; index < count; index++) {
    const code = (Math.imul(index, 1103515245) + 12345) >>> 25;
    if (predicate(code)) hits++;
  }
  return hits;
}

/** @param {(code:number)=>boolean} predicate @param {number} count @returns {number} */
function cpuMicrosPerCall(predicate, count) {
  const start = process.cpuUsage();
  const hits = work(predicate, count);
  const elapsed = process.cpuUsage(start);
  assert.ok(hits > 0);
  return (elapsed.user + elapsed.system) / count;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** @returns {{trials:number,cases:Array<Record<string,unknown>>}} */
function profileRuntime() {
  const trials = 9;
  const nativeCount = 60000000;
  const protectedCount = 12000000;
  /** @type {Array<Record<string,unknown>>} */
  const cases = [];

  for (const roundCount of [1, 2]) {
    const candidate = protectedPredicate(roundCount);
    for (let code = 0; code < 128; code++) {
      assert.equal(candidate(code), nativePredicate(code));
    }
    for (let warmup = 0; warmup < 4; warmup++) {
      work(nativePredicate, 400000);
      work(candidate, 200000);
    }

    /** @type {number[]} */
    const native = [];
    /** @type {number[]} */
    const protectedSamples = [];
    /** @type {number[]} */
    const ratios = [];
    for (let trial = 0; trial < trials; trial++) {
      let nativeSample;
      let protectedSample;
      if ((trial & 1) === 0) {
        nativeSample = cpuMicrosPerCall(nativePredicate, nativeCount);
        protectedSample = cpuMicrosPerCall(candidate, protectedCount);
      } else {
        protectedSample = cpuMicrosPerCall(candidate, protectedCount);
        nativeSample = cpuMicrosPerCall(nativePredicate, nativeCount);
      }
      native.push(nativeSample);
      protectedSamples.push(protectedSample);
      ratios.push(protectedSample / nativeSample);
    }

    cases.push({
      roundCount,
      nativeMedianMicrosPerCall:median(native),
      protectedMedianMicrosPerCall:median(protectedSamples),
      ratioOfMedians:median(protectedSamples) / median(native),
      strictBreaches:ratios.filter(ratio => ratio > 2.5).length,
      maxPairRatio:Math.max(...ratios),
      pairRatios:ratios,
      nativeSamplesMicrosPerCall:native,
      protectedSamplesMicrosPerCall:protectedSamples
    });
  }
  return {trials, cases};
}

function main() {
  console.log(JSON.stringify({
    node:process.version,
    platform:process.platform,
    recovery:runHeldoutRecovery(),
    runtime:profileRuntime()
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  ATTACKER_COMMIT,
  ATTACKER_BLOB,
  SEED,
  expandRounds,
  runHeldoutRecovery,
  seededTransform32,
  profileRuntime
};
