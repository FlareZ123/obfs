'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {recoverRotatedCoreSource} = require('../sims/a2mba-rotated-core-static-recover');

const FIXED_SOURCE = `
function q(v){return ((v<<5)|(v>>>27))|0;}
function w(v){return ((v>>>5)|(v<<27))|0;}
function e(a,b){
  const s=(a+b)|0;
  const h=((a>>>5)+(b>>>5))|0;
  const c=h>>>27;
  const u=h<<5;
  const l=(s+c)&31;
  return (u|l)|0;
}
function p(x,y,z,t){
  const a=(x^t)|0;
  const b=(z&t)|0;
  const c=(x+z)|0;
  const ra=q(a),rb=q(b),rc=q(c),ry=q(y);
  const f=e(ra,ry);
  const s=e(f,rb);
  const k=(rc|ry)|0;
  return w(s^k);
}`;

/** @param {number} x @param {number} y @param {number} z @param {number} t @returns {number} */
function nativeRegion32(x, y, z, t) {
  const left = ((((x ^ t) + y) | 0) + (z & t)) | 0;
  const right = ((x + z) | 0) | y;
  return (left ^ right) | 0;
}

test('static recoverer canonicalizes a fixed rotated-core fixture without candidate execution', () => {
  const recovered = recoverRotatedCoreSource(FIXED_SOURCE);
  assert.equal(recovered.rotation, 5);
  const fn = vm.runInNewContext(`(${recovered.recoveredSource})`);
  let state = 0x243f6a88 | 0;
  for (let index = 0; index < 100000; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const x = state;
    const y = (state ^ index) | 0;
    const z = Math.imul(state, 3);
    const t = state >>> 9;
    assert.equal(fn(x, y, z, t), nativeRegion32(x, y, z, t));
  }
});

test('static recoverer rejects a corrupted packed-add helper', () => {
  const corrupted = FIXED_SOURCE.replace('const c=h>>>27;', 'const c=h>>>26;');
  assert.throws(() => recoverRotatedCoreSource(corrupted), /packed rotated-add helper not found/);
});
