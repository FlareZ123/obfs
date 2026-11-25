'use strict';

const crypto = require('node:crypto');

function seededWordGenerator(seed) {
  let counter = 0;
  return () => {
    const digest = crypto.createHash('sha256')
      .update(String(seed) + ':' + String(counter++))
      .digest();
    return digest.readUInt32BE(0) >>> 0;
  };
}

function gf2Rank(vectors, width = 32) {
  const pivots = new Uint32Array(width);
  let rank = 0;
  for (const value of vectors) {
    let row = value >>> 0;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((row >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        row = (row ^ pivots[bit]) >>> 0;
      } else {
        pivots[bit] = row;
        rank++;
        break;
      }
    }
  }
  return rank;
}

function extendAnchors(anchors, width = 32) {
  if (anchors.length !== 5 || gf2Rank(anchors, width) !== 5) {
    throw new Error('anchors must be five independent vectors');
  }
  const basis = anchors.map((value) => value >>> 0);
  for (let bit = 0; bit < width && basis.length < width; bit++) {
    const candidate = (1 << bit) >>> 0;
    if (gf2Rank([...basis, candidate], width) > basis.length) basis.push(candidate);
  }
  if (basis.length !== width || gf2Rank(basis, width) !== width) {
    throw new Error('failed to extend anchors to a full basis');
  }
  return basis;
}

function buildBasisSolver(basis, width = 32) {
  if (basis.length !== width) throw new Error('basis has wrong width');
  const pivotRows = new Uint32Array(width);
  const pivotCoefficients = new Uint32Array(width);
  for (let index = 0; index < width; index++) {
    let row = basis[index] >>> 0;
    let coefficients = (1 << index) >>> 0;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((row >>> bit) & 1) === 0) continue;
      if (pivotRows[bit] !== 0) {
        row = (row ^ pivotRows[bit]) >>> 0;
        coefficients = (coefficients ^ pivotCoefficients[bit]) >>> 0;
      } else {
        pivotRows[bit] = row;
        pivotCoefficients[bit] = coefficients;
        break;
      }
    }
    if (row === 0) throw new Error('dependent input basis');
  }

  return (value) => {
    let row = value >>> 0;
    let coefficients = 0;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((row >>> bit) & 1) === 0) continue;
      if (pivotRows[bit] === 0) throw new Error('value outside basis span');
      row = (row ^ pivotRows[bit]) >>> 0;
      coefficients = (coefficients ^ pivotCoefficients[bit]) >>> 0;
    }
    if (row !== 0) throw new Error('value outside basis span');
    return coefficients >>> 0;
  };
}

function reconstruct(coefficients, basis, width = 32) {
  let value = 0;
  for (let bit = 0; bit < width; bit++) {
    if (((coefficients >>> bit) & 1) !== 0) value = (value ^ basis[bit]) >>> 0;
  }
  return value >>> 0;
}

function main() {
  const trials = 1000;
  const randomInputsPerTrial = 100;
  let complementTotal = 0;
  let roundTrips = 0;
  for (let trial = 0; trial < trials; trial++) {
    const draw = seededWordGenerator(0x43000000 + trial);
    const anchors = [];
    while (anchors.length < 5) {
      const candidate = draw();
      if (gf2Rank([...anchors, candidate]) > anchors.length) anchors.push(candidate);
    }
    const basis = extendAnchors(anchors);
    complementTotal += basis.length - anchors.length;
    const express = buildBasisSolver(basis);
    for (let index = 0; index < 5; index++) {
      if (express(anchors[index]) !== ((1 << index) >>> 0)) {
        throw new Error('anchor coordinate mismatch trial=' + trial + ' index=' + index);
      }
    }
    for (let sample = 0; sample < randomInputsPerTrial; sample++) {
      const value = draw();
      const coefficients = express(value);
      if (reconstruct(coefficients, basis) !== value) {
        throw new Error('round-trip mismatch trial=' + trial + ' sample=' + sample);
      }
      roundTrips++;
    }
  }
  return {
    trials,
    randomInputsPerTrial,
    complementVectorsPerTrial: complementTotal / trials,
    roundTrips,
    status: 'passed',
    note: 'deterministic SHA-256 counter tapes; JS Uint32 bit-31 path exercised',
  };
}

console.log(JSON.stringify(main(), null, 2));
