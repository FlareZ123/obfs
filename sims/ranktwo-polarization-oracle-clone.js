'use strict';

const assert = require('node:assert/strict');

/** @typedef {{bits:number,base:number,linear:number[],nonlinear:number,p:number[],q:number[],queries:number,pairTrials:number}} Clone */

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns, x) {
  let value = 0;
  for (let i = 0; i < columns.length; i++) {
    if ((x >>> i) & 1) value ^= columns[i];
  }
  return value >>> 0;
}

/** @param {number} x @returns {number} */
function parity(x) {
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x ^= x >>> 2;
  x ^= x >>> 1;
  return x & 1;
}

/** @param {number[]} cols @param {number} width @returns {number} */
function rank(cols, width) {
  const pivots = Array(width).fill(0);
  let count = 0;
  for (const col of cols) {
    let word = col;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (!((word >>> bit) & 1)) continue;
      if (pivots[bit]) word ^= pivots[bit];
      else {
        pivots[bit] = word >>> 0;
        count++;
        break;
      }
    }
  }
  return count;
}

/** @param {()=>number} draw @returns {number[]} */
function invertibleColumns(draw) {
  const cols = Array.from({length: 32}, (_, i) => (1 << i) >>> 0);
  for (let j = 0; j < 384; j++) {
    const a = draw() % 32;
    let b = draw() % 31;
    if (b >= a) b++;
    cols[a] = (cols[a] ^ cols[b]) >>> 0;
    if ((draw() & 3) === 0) {
      const value = cols[a];
      cols[a] = cols[b];
      cols[b] = value;
    }
  }
  return cols;
}

/**
 * Learn full F with only legitimate chosen-input calls under the promise
 * F(x)=b xor A*x xor U*g(V*x), rank(V)<=2, arbitrary g.
 * A and U may be singular; no injection assumption is needed.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits 1..32
 * @param {()=>number} draw
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle, bits, draw, delta = 1e-10) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 32)
    throw new RangeError('Require 1..32 input bits');
  const mask = bits === 32 ? 0xffffffff : (2 ** bits - 1);
  /** @type {Map<number,number>} */
  const seen = new Map();
  /** @param {number} value @returns {number} */
  function ask(value) {
    const x = (value & mask) >>> 0;
    if (!seen.has(x)) seen.set(x, oracle(x) >>> 0);
    return /** @type {number} */ (seen.get(x));
  }
  const base = ask(0);
  const linear = Array.from({length: bits}, (_, i) =>
    (ask((1 << i) >>> 0) ^ base) >>> 0);
  /** @param {number} a @param {number} b @returns {number} */
  function polar(a, b) {
    return (ask((a ^ b) >>> 0) ^ ask(a) ^ ask(b) ^ base) >>> 0;
  }

  const bound = Math.ceil(Math.log(delta) / Math.log(5 / 8));
  let nonlinear = 0, pivotA = 0, pivotB = 0, pairTrials = 0;
  for (; pairTrials < bound; pairTrials++) {
    const a = draw() & mask, b = draw() & mask;
    const candidate = polar(a, b);
    if (candidate) {
      nonlinear = candidate;
      pivotA = a >>> 0;
      pivotB = b >>> 0;
      pairTrials++;
      break;
    }
  }
  const p = Array(bits).fill(0), q = Array(bits).fill(0);
  if (nonlinear) {
    for (let i = 0; i < bits; i++) {
      const a = polar((1 << i) >>> 0, pivotA);
      const b = polar((1 << i) >>> 0, pivotB);
      assert.ok(a === 0 || a === nonlinear);
      assert.ok(b === 0 || b === nonlinear);
      p[i] = Number(a !== 0);
      q[i] = Number(b !== 0);
    }
    assert.equal(polar(pivotA, pivotB), nonlinear);
  }
  assert.ok(seen.size <= (bits + 1) + 3 * bound + 2 * bits);
  return {bits,base,linear,nonlinear,p,q,queries:seen.size,pairTrials};
}

/** @param {Clone} model @param {number} x @returns {number} */
function evaluate(model, x) {
  let value = (model.base ^ apply(model.linear, x)) >>> 0;
  if (!model.nonlinear) return value;
  let pSum = 0, qSum = 0, quadratic = 0;
  for (let i = 0; i < model.bits; i++) {
    if (!((x >>> i) & 1)) continue;
    quadratic ^= (pSum & model.q[i]) ^ (qSum & model.p[i]);
    pSum ^= model.p[i];
    qSum ^= model.q[i];
  }
  if (quadratic) value ^= model.nonlinear;
  return value >>> 0;
}

/** @returns {number[][]} */
function planes3() {
  /** @type {number[][]} */
  const planes = [];
  const seen = new Set();
  for (let a = 1; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const label = [a,b,a^b].sort((x,y)=>x-y).join(',');
      if (seen.has(label)) continue;
      seen.add(label);
      planes.push([a,b]);
    }
  }
  assert.equal(planes.length,7);
  return planes;
}

/** @param {()=>number} draw @returns {(x:number)=>number} */
function random32(draw) {
  const A = invertibleColumns(draw);
  let u = draw(), v = draw();
  if (!u) u = 1;
  if (!v || v === u) v = (u ^ 0x80000000) >>> 0;
  let s = draw(), t = draw();
  if (!s) s = 1;
  if (!t || t === s) t = (s ^ 0x80000000) >>> 0;
  const table = Array.from({length: 4}, () => draw() & 3);
  const constant = draw();
  return x => {
    const label = parity(s & x) | (parity(t & x) << 1);
    const select = table[label];
    return (apply(A, x) ^ constant ^
      ((select & 1) ? u : 0) ^ ((select & 2) ? v : 0)) >>> 0;
  };
}

/** @param {()=>number} draw @returns {(x:number)=>number} */
function randomNoninjective32(draw) {
  const inputMatrix = invertibleColumns(draw);
  const outputMatrix = invertibleColumns(draw);
  const inputOffset = draw(), outputOffset = draw();
  return x => {
    const internal = (apply(inputMatrix,x) ^ inputOffset) >>> 0;
    const inner = (internal & 0xfffffffc) |
      ((internal & 1) & ((internal >>> 1) & 1));
    return (apply(outputMatrix,inner) ^ outputOffset) >>> 0;
  };
}

/** @returns {object} */
function main() {
  const planes = planes3();
  let finiteCases = 0, finiteChecks = 0, finiteAffine = 0;
  for (let u = 0; u < planes.length; u++) {
    for (let v = 0; v < planes.length; v++) {
      const U = planes[u], V = planes[v];
      const corrections = [0,U[0],U[1],U[0]^U[1]];
      for (let encoded = 0; encoded < 256; encoded++) {
        const table = [encoded&3,(encoded>>>2)&3,(encoded>>>4)&3,(encoded>>>6)&3];
        /** @param {number} x @returns {number} */
        const F = x => {
          const label = parity(V[0] & x) | (parity(V[1] & x) << 1);
          return (x ^ corrections[table[label]]) >>> 0;
        };
        let live = true, calls = 0;
        const model = clone(x => {
          if (!live) throw Error('Offline clone used original oracle');
          calls++;
          return F(x);
        },3,seeded((0xa4215997 ^ (u<<17) ^ (v<<12) ^ encoded)>>>0));
        live = false;
        assert.equal(calls, model.queries);
        if (!model.nonlinear) finiteAffine++;
        const transported = /** @type {Clone} */ (JSON.parse(JSON.stringify(model)));
        for (let x = 0; x < 8; x++) {
          assert.equal(evaluate(transported,x),F(x));
          finiteChecks++;
        }
        finiteCases++;
      }
    }
  }
  assert.equal(finiteCases,7*7*256);
  assert.equal(finiteChecks,finiteCases*8);

  const draw=seeded(0xc8715a3c);
  let width32Cases=0, width32Heldouts=0, affine32=0;
  let nonaffine32=0, maxQueries=0, maxTrials=0, noninjective32=0;
  for(let trial=0;trial<96;trial++) {
    const noninjective=trial%3===0;
    const F=noninjective?randomNoninjective32(draw):random32(draw);
    let live=true, calls=0;
    const model=clone(x=>{
      if(!live)throw Error('Offline clone attempted server access');
      calls++;
      return F(x);
    },32,seeded((0x7293ac14^trial*0x9e3779b9)>>>0));
    live=false;
    assert.equal(calls,model.queries);
    const encoded=/** @type {Clone} */ (JSON.parse(JSON.stringify(model)));
    for(let i=0;i<4096;i++) {
      const x=draw();
      assert.equal(evaluate(encoded,x),F(x),'Exact post-server output mismatch');
      width32Heldouts++;
    }
    if(encoded.nonlinear)nonaffine32++; else affine32++;
    if(noninjective)noninjective32++;
    maxQueries=Math.max(maxQueries,calls);
    maxTrials=Math.max(maxTrials,model.pairTrials);
    assert.ok(calls<=244);
    width32Cases++;
  }
  assert.ok(nonaffine32>0&&affine32>0&&noninjective32>0);
  const summary={family:'rank-two-input arbitrary output-vector quadratic oracle',
    mechanism:'polar rank-two basis plus quadratic reconstruction',
    width3:{cases:finiteCases,checkedOutputs:finiteChecks,affine:finiteAffine},
    width32:{cases:width32Cases,heldoutOutputs:width32Heldouts,
      affine:affine32,nonaffine:nonaffine32,
      deliberatelyNoninjective:noninjective32,maxDistinctQueries:maxQueries,
      maxPairTrials:maxTrials,confidenceQueryCap:244,
      failureBound:'(5/8)^49 < 1e-10 for independent-uniform pair draws'},
    sourceOnly:true,serverOffBeforeHeldouts:true,
    note:'Seeded inputs validate a fixed transcript, not the stated independent-uniform probability'};
  console.log(JSON.stringify(summary,null,2));
  return summary;
}
if(require.main===module)main();
module.exports={clone,evaluate,main};
