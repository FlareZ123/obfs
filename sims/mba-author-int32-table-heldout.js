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

const ATTACKER_COMMIT = 'ea38b303d26c09493ddb88d0a680f96ee4d5c230';
const SEED = 'heldout-after-ea38b303:2026-11-19:agent7:mba-table-loop:v1';

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

  /** @param {number} minimum @param {number} maximum @returns {number} */
  integer(minimum, maximum) {
    return minimum + (this.word() % (maximum - minimum + 1));
  }
}

/**
 * @param {HashStream} stream
 * @param {number} count
 * @returns {number[]}
 */
function uniqueShifts(stream, count) {
  const values = new Set();
  while (values.size < count) values.add(stream.integer(1, 31));
  return [...values].sort((a, b) => a - b);
}

/**
 * @param {HashStream} stream
 * @param {number} xorCount
 * @param {number} rotationCount
 * @returns {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}}
 */
function randomRound(stream, xorCount, rotationCount) {
  return {
    coefficients: [stream.word(), (stream.word() | 1) >>> 0],
    xorShifts: uniqueShifts(stream, xorCount),
    cyclicShifts: uniqueShifts(stream, rotationCount)
  };
}

/** @param {number[]} values @returns {string} */
function arrayLiteral(values) {
  return '[' + values.map(value => String(value >>> 0)).join(',') + ']';
}

/**
 * @param {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>} rounds
 * @param {number} target
 * @param {number} variant
 * @param {HashStream} stream
 * @returns {string}
 */
function sourceFor(rounds, target, variant, stream) {
  const xorCount = rounds[0].xorShifts.length;
  const rotationCount = rounds[0].cyclicShifts.length;
  const split0 = rounds.map(() => stream.word());
  const split1 = rounds.map((round, index) =>
    (round.coefficients[0] ^ split0[index]) >>> 0
  );
  const multipliers = rounds.map(round => round.coefficients[1]);
  const xorArrays = Array.from(
    {length: xorCount},
    (_, column) => rounds.map(round => round.xorShifts[column])
  );
  const rotationArrays = Array.from(
    {length: rotationCount},
    (_, column) => rounds.map(round => round.cyclicShifts[column])
  );

  const helper = (variant & 1) === 0 ?
    'function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}' :
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);';

  const lines = [
    "'use strict';",
    helper,
    'module.exports=function predicate(input){',
    'const mul=Math.imul;',
    'let x=input>>>0;',
    `const a=${arrayLiteral(split0)};`,
    `const b=${arrayLiteral(split1)};`,
    `const m=${arrayLiteral(multipliers)};`
  ];

  for (let column = 0; column < xorArrays.length; column++) {
    lines.push(`const s${column}=${arrayLiteral(xorArrays[column])};`);
  }
  for (let column = 0; column < rotationArrays.length; column++) {
    lines.push(`const r${column}=${arrayLiteral(rotationArrays[column])};`);
  }

  const test = (variant & 2) === 0 ? 'i<a.length' : 'i<=a.length-1';
  const update = (variant & 4) === 0 ? 'i++' : 'i+=1';
  lines.push(`for(let i=0;${test};${update}){`);

  const product = (variant & 8) === 0 ? 'mul(x,m[i])' : 'mul(m[i],x)';
  const polynomial = (variant & 16) === 0 ?
    `a[i]^${product}^b[i]` :
    `b[i]^a[i]^${product}`;
  lines.push(`const p=(${polynomial})>>>0;`);

  let xorTerms = ['p'];
  for (let column = 0; column < xorArrays.length; column++) {
    xorTerms.push(`(p>>>s${column}[i])`);
  }
  if ((variant & 1) !== 0) xorTerms = xorTerms.reverse();
  lines.push(`const q=(${xorTerms.join('^')})>>>0;`);

  let rotations = rotationArrays.map((_, column) => `rot(q,r${column}[i])`);
  if ((variant & 2) !== 0) rotations = rotations.reverse();
  lines.push(`x=(${rotations.join('^')})>>>0;`);
  lines.push('}');

  lines.push((variant & 1) === 0 ?
    `return x===${target >>> 0};` :
    `return ${target >>> 0}===x;`);
  lines.push('};');
  return lines.join('\n');
}

/**
 * @returns {{
 *   attackerCommit:string,
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
function runTableHeldoutRecovery() {
  const stream = new HashStream(SEED);
  /** @type {Array<Record<string,unknown>>} */
  const records = [];

  for (let index = 0; index < 32; index++) {
    const roundCount = (index & 1) + 1;
    const xorCount = (index & 2) === 0 ? 1 : 2;
    const rotationCount = (index & 4) === 0 ? 3 : 5;
    const rounds = Array.from(
      {length: roundCount},
      () => randomRound(stream, xorCount, rotationCount)
    );
    const secret = stream.word();
    const target = forwardChain32(secret, rounds);
    const source = sourceFor(rounds, target, index, stream);
    const minified = transformSync(source, {
      loader: 'js',
      format: 'cjs',
      target: 'es2022',
      minify: true,
      legalComments: 'none'
    }).code;

    let oldSyntaxRejected = false;
    try {
      recover(minified);
    } catch (error) {
      assert.match(
        String(error),
        /round bound not found|literal round count not found|round parameters not structurally recoverable/
      );
      oldSyntaxRejected = true;
    }
    assert.equal(oldSyntaxRejected, true);

    const started = performance.now();
    const extracted = recoverDataflow(minified);
    const recoveryMs = performance.now() - started;

    assert.equal(extracted.inputIndex, 0);
    assert.equal(extracted.target, target);
    assert.deepEqual(extracted.rounds, rounds);
    assert.equal(inverseChain32(extracted.target, extracted.rounds), secret);

    records.push({
      index,
      roundCount,
      xorCount,
      rotationCount,
      minifiedBytes: Buffer.byteLength(minified),
      recoveryMs,
      oldSyntaxRejected,
      exactParameters: true,
      exactPreimage: true
    });
  }

  return {
    attackerCommit: ATTACKER_COMMIT,
    seed: SEED,
    cases: records.length,
    oneRoundCases: records.filter(record => record.roundCount === 1).length,
    twoRoundCases: records.filter(record => record.roundCount === 2).length,
    oldSyntaxRejections: records.filter(record => record.oldSyntaxRejected === true).length,
    exactParameterRecoveries: records.filter(record => record.exactParameters === true).length,
    exactPreimages: records.filter(record => record.exactPreimage === true).length,
    maxRecoveryMs: Math.max(...records.map(record => Number(record.recoveryMs))),
    records
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runTableHeldoutRecovery(), null, 2));
}

module.exports = {ATTACKER_COMMIT, SEED, runTableHeldoutRecovery};
