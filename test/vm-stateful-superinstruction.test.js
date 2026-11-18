'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {
  buildProgram,
  nativeKernel,
  runStatefulVm,
  recoverPublicProgram,
  runRecovered
} = require('../sims/vm-stateful-superinstruction-negative');

test('rolling-state superinstruction format is exactly recoverable without build seed', () => {
  let cases = 0;
  for (const seed of [
    'heldout-a', 'heldout-b', 'heldout-c', 'heldout-d',
    'heldout-e', 'heldout-f', 'heldout-g', 'heldout-h'
  ]) {
    for (const rounds of [1, 2, 4, 8, 16, 32]) {
      const program = buildProgram(rounds, seed);
      const recovered = recoverPublicProgram(program);
      assert.equal(recovered.length, rounds);
      for (const input of [
        0, 1, 47, 0x7fffffff, 0x80000000, 0xffffffff, 0x12345678
      ]) {
        const expected = nativeKernel(input, rounds);
        assert.equal(runStatefulVm(input, program), expected);
        assert.equal(runRecovered(input, recovered), expected);
        cases++;
      }
    }
  }
  assert.equal(cases, 336);
});

test('tampered rolling-state opcode is rejected by runtime and attacker', () => {
  const program = buildProgram(8, 'tamper-case');
  const corrupted = {
    ...program,
    words:[...program.words]
  };
  corrupted.words[0] ^= 0xff;
  assert.throws(() => runStatefulVm(47, corrupted), /Invalid VM opcode/u);
  assert.throws(() => recoverPublicProgram(corrupted), /Unknown public VM opcode/u);
});
