'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {screenBinaryOpcodes,mixedResidual,gf2Rank32,operations}=
  require('../sims/a2mba-opcode-residual-rank');

test('exact mixed residual rank bounds and one-query opcode fingerprint coexist',()=>{
  assert.deepEqual(screenBinaryOpcodes(),[
    {opcode:'add',rank:31,probe:5,witnesses:32},
    {opcode:'sub',rank:31,probe:-1,witnesses:32},
    {opcode:'mul',rank:32,probe:6,witnesses:32},
    {opcode:'and',rank:32,probe:2,witnesses:32},
    {opcode:'or',rank:32,probe:3,witnesses:32},
    {opcode:'xor',rank:0,probe:1,witnesses:32}
  ]);
});

test('exact boundary witness vectors include signed top-bit rollover',()=>{
  assert.equal(mixedResidual(operations.add,-2147483648,-2147483648),0);
  assert.equal(mixedResidual(operations.sub,-2147483648,-2147483648),0);
  assert.equal(mixedResidual(operations.mul,1,-2147483648),-2147483648);
  assert.equal(mixedResidual(operations.and,-2147483648,-2147483648),-2147483648);
  assert.equal(mixedResidual(operations.or,-2147483648,-2147483648),-2147483648);
  assert.equal(gf2Rank32([3,6,12,24,48,96,192,384]),8);
});
