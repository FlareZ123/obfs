'use strict';

/**
 * Chosen-query inversion of F(x)=b XOR A*x XOR U*g(V*x) over GF(2).
 * This standalone proof witness uses n<=16 so its finite domain can be
 * independently exhausted. There are no imports from the obfuscator.
 */
const assert = require('node:assert/strict');
const {randomInt}=require('node:crypto');

/** @param {number} seed @returns {()=>number} */
function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} v @returns {number} */
function parity(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v ^= v >>> 2;
  v ^= v >>> 1;
  return v & 1;
}

/** @param {number[]} rows @param {number} input @returns {number} */
function applyRows(rows, input) {
  let out = 0;
  for (let i = 0; i < rows.length; i++) out |= parity(rows[i] & input) << i;
  return out;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyColumns(columns, input) {
  let out = 0;
  for (let i = 0; i < columns.length; i++) if ((input >>> i) & 1) out ^= columns[i];
  return out;
}

/**
 * Insert into a GF(2) span. Retain the original vector for explicit
 * reconstruction of the unknown low-dimensional residual space.
 * @param {{pivots:number[],vectors:number[]}} span
 * @param {number} value
 * @returns {boolean}
 */
function addToSpan(span, value) {
  let reduced = value;
  for (let i = span.pivots.length - 1; i >= 0; i--) {
    if (!((reduced >>> i) & 1)) continue;
    if (span.pivots[i]) reduced ^= span.pivots[i];
    else {
      span.pivots[i] = reduced;
      span.vectors.push(value);
      return true;
    }
  }
  return false;
}

/** @param {number} bits @returns {{pivots:number[],vectors:number[]}} */
function newSpan(bits) {
  return {pivots: Array(bits).fill(0), vectors: []};
}

/** @param {bigint} value @returns {number} */
function parityBig(value) {
  let p = 0;
  while (value) {
    p ^= 1;
    value &= value - 1n;
  }
  return p;
}

/**
 * Solve B*(x,c)=rhs with B=[Ahat W] and enumerate all its solutions.
 * When W is complete, each x solving this affine envelope is checked
 * independently. Nonbijective functions can have a deficient B matrix,
 * but every candidate remains in one unknown r-dimensional coset,
 * giving at most 2^r inputs even if F is not injective.
 * @param {number[]} columns
 * @param {number} rhs
 * @param {number} n
 * @returns {number[]}
 */
function solveAffinePreimageCandidates(columns, rhs, n) {
  const width = columns.length;
  /** @type {{mask:bigint,rhs:number}[]} */
  const equations = [];
  for (let bit = 0; bit < n; bit++) {
    let mask = 0n;
    for (let col = 0; col < width; col++) {
      if ((columns[col] >>> bit) & 1) mask |= 1n << BigInt(col);
    }
    equations.push({mask, rhs: (rhs >>> bit) & 1});
  }
  /** @type {number[]} */
  const pivotColumns = [];
  let row = 0;
  for (let col = 0; col < width && row < n; col++) {
    const bit = 1n << BigInt(col);
    let pivot = row;
    while (pivot < n && !(equations[pivot].mask & bit)) pivot++;
    if (pivot === n) continue;
    [equations[row], equations[pivot]] = [equations[pivot], equations[row]];
    for (let j = 0; j < n; j++) {
      if (j !== row && (equations[j].mask & bit)) {
        equations[j].mask ^= equations[row].mask;
        equations[j].rhs ^= equations[row].rhs;
      }
    }
    pivotColumns.push(col);
    row++;
  }
  for (let i = row; i < n; i++) if (equations[i].rhs) return [];
  /** @type {number[]} */
  const freeColumns = [];
  for (let col = 0; col < width; col++) if (!pivotColumns.includes(col)) freeColumns.push(col);
  const candidates = [];
  for (let assignment = 0; assignment < 2 ** freeColumns.length; assignment++) {
    let solution = 0n;
    for (let i = 0; i < freeColumns.length; i++) {
      if ((assignment >>> i) & 1) solution |= 1n << BigInt(freeColumns[i]);
    }
    for (let i = 0; i < row; i++) {
      const value = equations[i].rhs ^ parityBig(equations[i].mask & solution);
      if (value) solution |= 1n << BigInt(pivotColumns[i]);
    }
    candidates.push(Number(solution & ((1n << BigInt(n)) - 1n)));
  }
  return candidates;
}

/**
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {number} rankBound
 * @param {number} failureProbability
 * @param {(()=>number)=} random  Defaults to independent uniform crypto samples.
 *   Deterministic seeded test generators prove only their fixed transcript.
 * @returns {{base:number,columns:number[],residual:number[],observed:Map<number,number>,samples:number}}
 */
function learn(oracle, n, rankBound, failureProbability, random = () => randomInt(0,1<<n)) {
  const observed = new Map();
  /** @param {number} x */
  function ask(x) {
    if (!observed.has(x)) observed.set(x, oracle(x));
    return /** @type {number} */ (observed.get(x));
  }
  const base = ask(0);
  const columns = Array.from({length:n}, (_,i) => ask(1 << i) ^ base);
  const residual = newSpan(n);
  const samples = rankBound ? Math.ceil(2 ** rankBound *
    Math.log((2 ** rankBound - 1) / failureProbability)) : 0;
  for (let i = 0; i < samples; i++) {
    const x = random() & ((1 << n) - 1);
    const rest = ask(x) ^ base ^ applyColumns(columns, x);
    addToSpan(residual, rest);
  }
  return {base, columns, residual: residual.vectors, observed, samples};
}

/**
 * @param {(x:number)=>number} oracle
 * @param {{base:number,columns:number[],residual:number[]}} learned
 * @param {number} target
 * @returns {{answer:number|null,candidates:number}}
 */
function invert(oracle, learned, target) {
  const candidates = solveAffinePreimageCandidates(
    [...learned.columns, ...learned.residual], target ^ learned.base,
    learned.columns.length);
  for (const x of candidates) if (oracle(x) === target) return {answer:x, candidates:candidates.length};
  return {answer:null, candidates:candidates.length};
}

/** @param {number} n @param {()=>number} random @returns {number[]} */
function invertibleRows(n, random) {
  for (;;) {
    const rows = Array.from({length:n}, () => random() & ((1 << n) - 1));
    const span = newSpan(n);
    rows.forEach(v => addToSpan(span,v));
    if (span.vectors.length === n) return rows;
  }
}

/**
 * @param {number} n @param {number} r @param {'shear'|'quotient'|'nonbijective'} kind
 * @param {()=>number} random
 * @returns {(x:number)=>number}
 */
function generate(n, r, kind, random) {
  const A = invertibleRows(n, random);
  /** @type {number[]} */
  const V = [];
  const rankV = newSpan(n);
  while (V.length < r) {
    const candidate = random() & ((1 << n) - 1);
    if (addToSpan(rankV, candidate)) V.push(candidate);
  }
  const K = [];
  const rankK = newSpan(n);
  for (let bit = 0; bit < r; bit++) {
    const desired = kind === 'shear' ? 0 : 1 << bit;
    for (;;) {
      const candidate = random() & ((1 << n) - 1);
      if (applyRows(V, candidate) === desired && addToSpan(rankK, candidate)) {
        K.push(candidate);
        break;
      }
    }
  }
  const U = K.map(v => applyRows(A, v));
  const g = Array.from({length:1 << r}, () => random() & ((1 << r) - 1));
  if (kind === 'quotient') {
    const P = Array.from({length:1 << r}, (_,i) => i);
    for (let i = P.length - 1; i > 0; i--) {
      const j = random() % (i + 1);
      [P[i], P[j]] = [P[j], P[i]];
    }
    for (let z = 0; z < P.length; z++) g[z] = z ^ P[z];
  }
  const b = random() & ((1 << n) - 1);
  return x => (b ^ applyRows(A, x) ^ applyColumns(U, g[applyRows(V,x)])) >>> 0;
}

/** @returns {object} */
function main() {
  const n=12, delta=1e-10, rValues=[1,2,3];
  let cases=0, nontrivial=0, singular=0, totalQueries=0, maxQueries=0;
  let maxCandidates=0, noTrainingTarget=0, nonbijective=0, noImageChecks=0, allTargetChecks=0;
  for (const r of rValues) for (const kind of /** @type {const} */ (['shear','quotient','nonbijective'])) {
    for (let k=0; k<60; k++) {
      const random=randomFromSeed(0xa51c57e ^ (r*0x10000) ^ (k*0x234f) ^ (kind==='shear'?0:kind==='quotient'?0xbadde:0xdeaedd));
      const F=generate(n,r,kind,random);
      const seen=new Uint16Array(1<<n);
      for (let x=0; x<(1<<n); x++) seen[F(x)]++;
      if(kind!=='nonbijective') {
        assert.ok(seen.every(v=>v===1),`fixture not bijective: ${r} ${kind} ${k}`);
      } else if(seen.some(v=>v!==1)) nonbijective++;
      const cached=learn(F,n,r,delta,random);
      assert.ok(cached.residual.length<=r);
      if (cached.residual.length) nontrivial++;
      const span=newSpan(n);
      for (const col of cached.columns) addToSpan(span,col);
      if (span.vectors.length<n) singular++;
      let targetX=random() & ((1<<n)-1);
      while (cached.observed.has(targetX)) targetX=(targetX+1)&((1<<n)-1);
      noTrainingTarget++;
      if(kind==='nonbijective' && r>=2 && k<3) {
        for(let y=0;y<(1<<n);y++) {
          const result=invert(F,cached,y);
          assert.equal(result.answer===null,seen[y]===0,`image classification ${r} ${k} ${y}`);
          if(result.answer!==null)assert.equal(F(result.answer),y);
          assert.ok(result.candidates<=2**r);
          allTargetChecks++;
        }
      }
      const before=cached.observed.size;
      const verdict=invert(F,cached,F(targetX));
      assert.notEqual(verdict.answer,null,`missed image target: ${r} ${kind} ${k}`);
      assert.equal(F(/** @type {number} */ (verdict.answer)), F(targetX));
      if(kind!=='nonbijective')assert.equal(verdict.answer,targetX);
      assert.ok(verdict.candidates<=2**r);
      if(kind==='nonbijective') {
        const missing=seen.findIndex(v=>v===0);
        if(missing>=0) {
          const negative=invert(F,cached,missing);
          assert.equal(negative.answer,null,`invented unreachable image: ${r} ${k}`);
          noImageChecks++;
        }
      }
      const queryCount=before+verdict.candidates;
      assert.ok(queryCount<=n+1+cached.samples+2**r);
      totalQueries+=queryCount;
      maxQueries=Math.max(maxQueries,queryCount);
      maxCandidates=Math.max(maxCandidates,verdict.candidates);
      cases++;
    }
  }
  assert.ok(nontrivial>150 && singular>20 && nonbijective>100 && noImageChecks>100);
  const result={cases,n,rankBounds:rValues,nontrivial,singular,noTrainingTarget,
    totalQueries,maxQueries,maxCandidates,nonbijective,noImageChecks,allTargetChecks,
    meanQueryBudget:totalQueries/cases,
    delta,independentExecutable:__filename};
  console.log(JSON.stringify(result,null,2));
  return result;
}

if (require.main===module) main();
module.exports={learn,invert,generate,applyRows,applyColumns,solveAffinePreimageCandidates,main};
