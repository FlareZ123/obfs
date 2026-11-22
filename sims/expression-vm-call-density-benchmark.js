'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

/** @type {(input:number)=>number} */
const nativeMix = require('../examples/expression-vm/before.cjs');
/** @type {(input:number)=>number} */
const vmMix = require('../examples/expression-vm/after.cjs');

const iterations = 3_000_000;
const warmups = 4;
const samplesPerDensity = 7;
const callPeriods = [1, 2, 8, 16, 32, 64, 512];

/** @param {(input:number)=>number} fn @param {number} every @returns {number} */
function run(fn, every) {
  let output = 0;
  for (let i = 0; i < iterations; i++) {
    output ^= Math.imul(i, 13) ^ 1234567;
    if (i % every === 0) output ^= fn((i * 2654435761) | 0);
  }
  return output;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  return values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

for (let i = 0; i < 100_000; i++) {
  const input = (i * 2654435761) | 0;
  assert.equal(vmMix(input), nativeMix(input), `differential mismatch at ${input}`);
}

const results = [];
for (const every of callPeriods) {
  for (let i = 0; i < warmups; i++) {
    assert.equal(run(nativeMix, every), run(vmMix, every));
  }

  const nativeSamples = [];
  const vmSamples = [];
  for (let i = 0; i < samplesPerDensity; i++) {
    let start = performance.now();
    let nativeOutput;
    let vmOutput;
    if (i % 2 === 0) {
      nativeOutput = run(nativeMix, every);
      nativeSamples.push(performance.now() - start);
      start = performance.now();
      vmOutput = run(vmMix, every);
      vmSamples.push(performance.now() - start);
    } else {
      vmOutput = run(vmMix, every);
      vmSamples.push(performance.now() - start);
      start = performance.now();
      nativeOutput = run(nativeMix, every);
      nativeSamples.push(performance.now() - start);
    }
    assert.equal(vmOutput, nativeOutput);
  }

  const nativeMedianMs = median(nativeSamples);
  const vmMedianMs = median(vmSamples);
  const ratio = vmMedianMs / nativeMedianMs;
  results.push({
    callPeriod: `1/${every}`,
    calls: Math.ceil(iterations / every),
    nativeMedianMs: Number(nativeMedianMs.toFixed(3)),
    vmMedianMs: Number(vmMedianMs.toFixed(3)),
    ratio: Number(ratio.toFixed(3)),
    within2_5xBudget: ratio <= 2.5
  });
}

console.log(JSON.stringify({
  benchmark: 'expression-vm direct and sparse call-density',
  iterations,
  warmups,
  samplesPerDensity,
  differentialInputs: 100_000,
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  results,
  note: 'Observational benchmark; no universal performance assertion is made.'
}, null, 2));
