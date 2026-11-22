'use strict';

const { performance } = require('node:perf_hooks');

/** @param {number} value @returns {number} */
function u32(value) { return value >>> 0; }

/** @param {number} value @returns {number} */
function parity32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x &= 15;
  return (0x6996 >>> x) & 1;
}

/** @param {number} seed @returns {() => number} */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} seed @returns {number[]} */
function makeLinearColumns(seed) {
  const next = makeRng(seed);
  const columns = Array.from({ length: 32 }, (_, bit) => u32(2 ** bit));
  for (let round = 0; round < 512; round += 1) {
    const a = next() % 32;
    let b = next() % 32;
    if (a === b) b = (b + 1) % 32;
    if ((next() & 1) === 0) [columns[a], columns[b]] = [columns[b], columns[a]];
    else columns[b] = u32(columns[b] ^ columns[a]);
  }
  return columns;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let x = input >>> 0;
  let output = 0;
  let bit = 0;
  while (x !== 0) {
    if ((x & 1) !== 0) output ^= columns[bit];
    x >>>= 1;
    bit += 1;
  }
  return output >>> 0;
}

/** @param {number[]} columns @returns {(value:number)=>number} */
function makeLinearInverse(columns) {
  const left = Array(32).fill(0);
  const right = Array.from({ length: 32 }, (_, bit) => u32(2 ** bit));
  for (let row = 0; row < 32; row += 1) {
    let mask = 0;
    for (let column = 0; column < 32; column += 1) {
      if (((columns[column] >>> row) & 1) !== 0) mask = u32(mask | (2 ** column));
    }
    left[row] = mask;
  }
  for (let column = 0; column < 32; column += 1) {
    let pivot = column;
    while (pivot < 32 && ((left[pivot] >>> column) & 1) === 0) pivot += 1;
    if (pivot === 32) throw new Error('linear map is singular');
    [left[column], left[pivot]] = [left[pivot], left[column]];
    [right[column], right[pivot]] = [right[pivot], right[column]];
    for (let row = 0; row < 32; row += 1) {
      if (row === column || ((left[row] >>> column) & 1) === 0) continue;
      left[row] = u32(left[row] ^ left[column]);
      right[row] = u32(right[row] ^ right[column]);
    }
  }
  return (value) => {
    let output = 0;
    const y = value >>> 0;
    for (let bit = 0; bit < 32; bit += 1) {
      if (parity32(right[bit] & y) !== 0) output = u32(output | (2 ** bit));
    }
    return output >>> 0;
  };
}

/** @param {number[]} vectors @returns {number[]} */
function makeSpanBasis(vectors) {
  const pivots = Array(32).fill(0);
  for (const raw of vectors) {
    let value = raw >>> 0;
    for (let bit = 31; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value = u32(value ^ pivots[bit]);
      else {
        pivots[bit] = value;
        break;
      }
    }
  }
  return pivots;
}

/** @param {number} value @param {number[]} pivots @returns {boolean} */
function isInSpan(value, pivots) {
  let current = value >>> 0;
  for (let bit = 31; bit >= 0 && current !== 0; bit -= 1) {
    if (((current >>> bit) & 1) === 0) continue;
    if (pivots[bit] === 0) return false;
    current = u32(current ^ pivots[bit]);
  }
  return current === 0;
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {number}
 */
function invertCompatibleWithOuterLinear(oracle, target) {
  const base = oracle(0);
  const deltas = [];
  for (let bit = 0; bit < 32; bit += 1) deltas.push(u32(base ^ oracle(u32(2 ** bit))));
  const suffix = Array(33);
  suffix[32] = makeSpanBasis([]);
  for (let bit = 31; bit >= 0; bit -= 1) suffix[bit] = makeSpanBasis(deltas.slice(bit));
  let prefix = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    if (!isInSpan(u32(target ^ oracle(prefix)), suffix[bit + 1])) prefix = u32(prefix | (2 ** bit));
  }
  if (oracle(prefix) !== (target >>> 0)) throw new Error('outer inversion failed');
  return prefix >>> 0;
}

/** @param {number} degree @param {number} seed @returns {number[]} */
function makePermutationCoefficients(degree, seed) {
  const next = makeRng(seed);
  const coefficients = Array.from({ length: degree + 1 }, () => next());
  coefficients[1] = u32(coefficients[1] | 1);
  let evenParity = 0;
  for (let index = 2; index <= degree; index += 2) evenParity ^= coefficients[index] & 1;
  if (evenParity !== 0) coefficients[2] ^= 1;
  let oddParity = 0;
  for (let index = 3; index <= degree; index += 2) oddParity ^= coefficients[index] & 1;
  if (oddParity !== 0) coefficients[3] ^= 1;
  return coefficients.map(u32);
}

/** @param {number[]} columns @param {string} inputName @returns {string} */
function linearSource(columns, inputName) {
  let body = `let o=0;${inputName}>>>=0;`;
  for (let bit = 0; bit < 32; bit += 1) body += `if((${inputName}>>>${bit})&1)o^=${columns[bit]};`;
  return `${body}return o>>>0`;
}

/**
 * @param {number[]} coefficients
 * @param {string} inputName
 * @param {number} imulStyle
 * @returns {string}
 */
function polynomialSource(coefficients, inputName, imulStyle) {
  const prelude = imulStyle === 0 ? '' :
    imulStyle === 1 ? 'const m=Math.imul;' : 'const{imul:m}=Math;';
  const call = imulStyle === 0 ? 'Math.imul' : 'm';
  let body = `${inputName}>>>=0;${prelude}let a=${coefficients[coefficients.length - 1]};`;
  for (let index = coefficients.length - 2; index >= 0; index -= 1) {
    body += `a=(${call}(a,${inputName})+${coefficients[index]})>>>0;`;
  }
  return `${body}return a`;
}

/** @param {number} seed @returns {{source:string,secret:number}} */
function makeCandidate(seed) {
  const next = makeRng(seed);
  const innerColumns = makeLinearColumns(next());
  const outerColumns = makeLinearColumns(next());
  const coefficients = makePermutationCoefficients(7, next());
  const secret = next();
  const imulStyle = next() % 3;
  const inner = (x) => applyLinear(innerColumns, x);
  const poly = (x) => {
    let a = coefficients[coefficients.length - 1];
    for (let index = coefficients.length - 2; index >= 0; index -= 1) {
      a = u32(Math.imul(a, x >>> 0) + coefficients[index]);
    }
    return a >>> 0;
  };
  const target = applyLinear(outerColumns, poly(inner(secret)));
  const suffix = (next() >>> 0).toString(36);
  const inName = `i${suffix}`;
  const pName = `p${suffix}`;
  const outName = `o${suffix}`;
  const qName = `q${suffix}`;
  const valueName = `v${suffix}`;
  const resultName = `r${suffix}`;
  const source =
    `'use strict';function ${inName}(x){${linearSource(innerColumns, 'x')}}` +
    `function ${pName}(x){${polynomialSource(coefficients, 'x', imulStyle)}}` +
    `function ${outName}(x){${linearSource(outerColumns, 'x')}}` +
    `function ${qName}(${valueName}){const ${resultName}=${outName}(${pName}(${inName}(${valueName}|0)));return ${resultName}===${target}}` +
    `module.exports=${qName};`;
  return { source, secret };
}

/** @param {string} source @param {object} mathObject @returns {(value:number)=>number|boolean} */
function compileModule(source, mathObject) {
  /** @type {{exports:unknown}} */
  const moduleRecord = { exports: null };
  Function('module', 'Math', source)(moduleRecord, mathObject);
  if (typeof moduleRecord.exports !== 'function') throw new Error('candidate did not export a function');
  return /** @type {(value:number)=>number|boolean} */ (moduleRecord.exports);
}

/** @param {string} source @returns {{source:string,target:number}} */
function exposeMap(source) {
  const pattern = /return ([A-Za-z_$][\w$]*)===([0-9]+)}/;
  const match = pattern.exec(source);
  if (!match) throw new Error('public equality pattern not found');
  const target = Number(match[2]) >>> 0;
  return { source: source.replace(pattern, `return ${match[1]}}`), target };
}

/**
 * @param {string} source
 * @returns {{secret:number,target:number,mapEvaluations:number,imulCalls:number}}
 */
function attackSource(source) {
  const exposed = exposeMap(source);
  const nativeImul = Math.imul;
  let capture = [];
  let imulCalls = 0;
  const instrumentedMath = Object.create(Math);
  instrumentedMath.imul = (a, b) => {
    capture.push(b >>> 0);
    imulCalls += 1;
    return nativeImul(a, b);
  };
  const map = compileModule(exposed.source, instrumentedMath);
  /** @type {Map<number,{output:number,polyInput:number}>} */
  const cache = new Map();
  const probe = (input) => {
    const key = input >>> 0;
    const prior = cache.get(key);
    if (prior) return prior;
    capture = [];
    const raw = map(key);
    if (typeof raw !== 'number') throw new Error('patched map did not return a number');
    if (capture.length === 0) throw new Error('no Math.imul polynomial trace observed');
    const polyInput = capture[0] >>> 0;
    for (const observed of capture) {
      if ((observed >>> 0) !== polyInput) throw new Error('polynomial input changed across Horner steps');
    }
    const row = { output: raw >>> 0, polyInput };
    cache.set(key, row);
    return row;
  };

  if (probe(0).polyInput !== 0) throw new Error('inner transform is not linear at zero');
  const innerColumns = [];
  for (let bit = 0; bit < 32; bit += 1) innerColumns.push(probe(u32(2 ** bit)).polyInput);
  const invertInner = makeLinearInverse(innerColumns);
  const outerOracle = (polyInput) => probe(invertInner(polyInput)).output;
  const hiddenPolyInput = invertCompatibleWithOuterLinear(outerOracle, exposed.target);
  const secret = invertInner(hiddenPolyInput);
  if (probe(secret).output !== exposed.target) throw new Error('recovered input does not hit published target');
  return { secret, target: exposed.target, mapEvaluations: cache.size, imulCalls };
}

function main() {
  const rows = [];
  let totalEvaluations = 0;
  for (let index = 0; index < 192; index += 1) {
    const sample = makeCandidate(u32(0x9e3779b9 ^ index));
    const start = performance.now();
    const attack = attackSource(sample.source);
    if (attack.secret !== sample.secret) throw new Error(`secret mismatch at sample ${index}`);
    totalEvaluations += attack.mapEvaluations;
    rows.push({
      mapEvaluations: attack.mapEvaluations,
      imulCalls: attack.imulCalls,
      attackMs: performance.now() - start,
      sourceBytes: Buffer.byteLength(sample.source),
    });
  }
  const sortedTimes = rows.map((row) => row.attackMs).sort((a, b) => a - b);
  console.log(JSON.stringify({
    model: 'public JS full sandwich L_out(P(L_in(x))) with arbitrary dense GF(2) wrappers and degree-7 Rivest P',
    attacker: 'patch final equality to expose map; intercept Math.imul before module evaluation to observe hidden polynomial input',
    samples: rows.length,
    recovered: rows.length,
    minMapEvaluations: Math.min(...rows.map((row) => row.mapEvaluations)),
    maxMapEvaluations: Math.max(...rows.map((row) => row.mapEvaluations)),
    medianMapEvaluations: rows.map((row) => row.mapEvaluations).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    medianAttackMs: Number(sortedTimes[Math.floor(sortedTimes.length / 2)].toFixed(3)),
    minSourceBytes: Math.min(...rows.map((row) => row.sourceBytes)),
    maxSourceBytes: Math.max(...rows.map((row) => row.sourceBytes)),
    totalMapEvaluations: totalEvaluations,
    result: 'all exact',
  }, null, 2));
}

if (require.main === module) main();

module.exports = { attackSource, makeCandidate };
