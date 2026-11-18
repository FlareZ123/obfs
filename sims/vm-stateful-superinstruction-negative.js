'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

const OPCODES = Object.freeze([0x17, 0x53, 0x95, 0xd3]);

/** @param {number} value @param {number} shift @returns {number} */
function rol(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/**
 * @param {number} state
 * @param {number} encodedOpcode
 * @param {number} encodedConstant
 * @returns {number}
 */
function nextDecodeState(state, encodedOpcode, encodedConstant) {
  return Math.imul(
    (state ^ encodedConstant ^ Math.imul(encodedOpcode, 0x9e3779b1)) >>> 0,
    0x45d9f3b
  ) >>> 0;
}

/**
 * @param {number} value
 * @param {number} constant
 * @param {number} variant
 * @returns {number}
 */
function superStep(value, constant, variant) {
  let x = value >>> 0;
  if ((variant & 1) === 0) {
    x = (x + constant) >>> 0;
    x = rol((x ^ (x >>> 13)) >>> 0, 7);
    return Math.imul((x ^ 0xa5a5a5a5) >>> 0, 0x27d4eb2d) >>> 0;
  }
  x = (x ^ constant) >>> 0;
  x = rol((x + 0x7f4a7c15) >>> 0, 11);
  return Math.imul((x ^ (x >>> 9)) >>> 0, 0x165667b1) >>> 0;
}

/** @typedef {{initialState:number,words:number[],rounds:number}} PublicProgram */
/** @typedef {{variant:number,constant:number}} RecoveredInstruction */

/**
 * Build a public rolling-state program. The build seed itself is absent from
 * the output. The emitted initial decoder state and encoded words are enough
 * for the runtime, and therefore also enough for a public-format attacker.
 *
 * @param {number} rounds
 * @param {string} seed
 * @returns {PublicProgram}
 */
function buildProgram(rounds, seed) {
  const digest = createHash('sha256').update(seed).digest();
  let state = digest.readUInt32LE(0) >>> 0;
  const initialState = state;
  /** @type {number[]} */
  const words = [];
  for (let round = 0; round < rounds; round++) {
    const variant = round & 1;
    const alias = (variant << 1) | ((state >>> 31) & 1);
    const opcode = OPCODES[alias];
    const constant = variant === 0 ?
      (0x9e3779b9 + Math.imul(round, 0x85ebca6b)) >>> 0 :
      (0xc2b2ae35 ^ Math.imul(round + 1, 0x27d4eb2d)) >>> 0;
    const encodedOpcode = (opcode ^ state) & 255;
    const encodedConstant = (constant ^ state) >>> 0;
    words.push(encodedOpcode, encodedConstant);
    state = nextDecodeState(state, encodedOpcode, encodedConstant);
  }
  return {initialState, words, rounds};
}

/** @param {number} input @param {number} rounds @returns {number} */
function nativeKernel(input, rounds) {
  let x = input >>> 0;
  for (let round = 0; round < rounds; round++) {
    const variant = round & 1;
    const constant = variant === 0 ?
      (0x9e3779b9 + Math.imul(round, 0x85ebca6b)) >>> 0 :
      (0xc2b2ae35 ^ Math.imul(round + 1, 0x27d4eb2d)) >>> 0;
    x = superStep(x, constant, variant);
  }
  return x;
}

/**
 * Execute while decoding the rolling state on every call.
 * @param {number} input
 * @param {PublicProgram} program
 * @returns {number}
 */
function runStatefulVm(input, program) {
  let x = input >>> 0;
  let state = program.initialState;
  for (let pc = 0; pc < program.words.length; pc += 2) {
    const encodedOpcode = program.words[pc];
    const encodedConstant = program.words[pc + 1];
    const opcode = (encodedOpcode ^ state) & 255;
    const alias = OPCODES.indexOf(opcode);
    if (alias < 0) throw new Error('Invalid VM opcode');
    const variant = alias >>> 1;
    const constant = (encodedConstant ^ state) >>> 0;
    state = nextDecodeState(state, encodedOpcode, encodedConstant);
    x = superStep(x, constant, variant);
  }
  return x;
}

/**
 * PUSHAN-style bounded negative control: carry virtual PC plus public decoder
 * state, decode each instruction without path constraints, and emit semantics.
 * This attacker receives the published program only and does not receive the
 * build seed or a runtime oracle.
 *
 * @param {PublicProgram} program
 * @returns {RecoveredInstruction[]}
 */
function recoverPublicProgram(program) {
  let state = program.initialState;
  /** @type {RecoveredInstruction[]} */
  const recovered = [];
  for (let pc = 0; pc < program.words.length; pc += 2) {
    const encodedOpcode = program.words[pc];
    const encodedConstant = program.words[pc + 1];
    const opcode = (encodedOpcode ^ state) & 255;
    const alias = OPCODES.indexOf(opcode);
    if (alias < 0) throw new Error('Unknown public VM opcode');
    recovered.push({
      variant:alias >>> 1,
      constant:(encodedConstant ^ state) >>> 0
    });
    state = nextDecodeState(state, encodedOpcode, encodedConstant);
  }
  return recovered;
}

/**
 * Execute the attacker's recovered semantic stream. This also models a VM
 * implementation that caches decoded instructions after initialization.
 *
 * @param {number} input
 * @param {RecoveredInstruction[]} recovered
 * @returns {number}
 */
function runRecovered(input, recovered) {
  let x = input >>> 0;
  for (const instruction of recovered) {
    x = superStep(x, instruction.constant, instruction.variant);
  }
  return x;
}

/**
 * @param {(value:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function cpuNanosPerCall(fn, count) {
  let checksum = 0;
  const begin = process.cpuUsage();
  for (let index = 0; index < count; index++) {
    checksum ^= fn((Math.imul(index, 0x9e3779b1) + 7) >>> 0);
  }
  const elapsed = process.cpuUsage(begin);
  if (checksum === 0x12345678) process.stderr.write('');
  return ((elapsed.user + elapsed.system) * 1000) / count;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

/** @param {number} rounds @returns {Record<string,unknown>} */
function profile(rounds) {
  const program = buildProgram(rounds, 'heldout-public-stateful-vm:' + rounds);
  const recovered = recoverPublicProgram(program);
  assert.equal(recovered.length, rounds);
  for (const value of [0, 1, 47, 0xffffffff, 0x12345678, 0x80000000]) {
    const native = nativeKernel(value, rounds);
    assert.equal(runStatefulVm(value, program), native);
    assert.equal(runRecovered(value, recovered), native);
  }

  /** @type {number[]} */
  const native = [];
  /** @type {number[]} */
  const vm = [];
  /** @type {number[]} */
  const prepared = [];
  const count = rounds <= 4 ? 3000000 : rounds <= 16 ? 1500000 : 750000;
  for (let warmup = 0; warmup < 4; warmup++) {
    cpuNanosPerCall(value => nativeKernel(value, rounds), 100000);
    cpuNanosPerCall(value => runStatefulVm(value, program), 100000);
    cpuNanosPerCall(value => runRecovered(value, recovered), 100000);
  }
  for (let trial = 0; trial < 9; trial++) {
    if ((trial & 1) === 0) {
      native.push(cpuNanosPerCall(value => nativeKernel(value, rounds), count));
      vm.push(cpuNanosPerCall(value => runStatefulVm(value, program), count));
      prepared.push(cpuNanosPerCall(value => runRecovered(value, recovered), count));
    } else {
      prepared.push(cpuNanosPerCall(value => runRecovered(value, recovered), count));
      vm.push(cpuNanosPerCall(value => runStatefulVm(value, program), count));
      native.push(cpuNanosPerCall(value => nativeKernel(value, rounds), count));
    }
  }
  const nativeMedian = median(native);
  const vmMedian = median(vm);
  const preparedMedian = median(prepared);
  return {
    rounds,
    recoveredInstructions:recovered.length,
    nativeMedianNanosPerCall:nativeMedian,
    decodeEveryCallMedianNanosPerCall:vmMedian,
    decodeEveryCallRatio:vmMedian / nativeMedian,
    decodeEveryCallStrictBreaches:vm
      .map((sample, index) => sample / native[index])
      .filter(ratio => ratio > 2.5).length,
    preparedMedianNanosPerCall:preparedMedian,
    preparedRatio:preparedMedian / nativeMedian,
    preparedStrictBreaches:prepared
      .map((sample, index) => sample / native[index])
      .filter(ratio => ratio > 2.5).length
  };
}

function main() {
  console.log(JSON.stringify({
    node:process.version,
    platform:process.platform,
    model:'public rolling decoder state + two coarse superinstruction families',
    attacker:'virtual-PC plus public decoder-state emulation; no oracle or build seed',
    profiles:[1, 2, 4, 8, 16, 32].map(profile)
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildProgram,
  nativeKernel,
  runStatefulVm,
  recoverPublicProgram,
  runRecovered
};
