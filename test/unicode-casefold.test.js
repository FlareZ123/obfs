'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {unicodeCaseFold}=require('../src/unicode-casefold');

test('Unicode 15.1 default full case folding handles expansions and symbols',()=>{
  assert.equal(unicodeCaseFold('ß'),'ss');
  assert.equal(unicodeCaseFold('ẞ'),'ss');
  assert.equal(unicodeCaseFold('ϑ'),'θ');
  assert.equal(unicodeCaseFold('ϴ'),'θ');
  assert.equal(unicodeCaseFold('ς'),'σ');
  assert.equal(unicodeCaseFold('ﬃ'),'ffi');
  assert.equal(unicodeCaseFold('և'),'եւ');
  assert.equal(unicodeCaseFold('ı'),'ı','Turkic-only mappings are excluded');
  assert.equal(unicodeCaseFold('İ'),'i\u0307');
});

test('Unicode full case folding is applied to complete multi-code-point strings',()=>{
  assert.equal(unicodeCaseFold('ßϑ'),'ssθ');
  assert.equal(unicodeCaseFold('ẞϴ'),'ssθ');
  assert.equal(unicodeCaseFold('ßϑ'),unicodeCaseFold('ẞϴ'));
  assert.notEqual(unicodeCaseFold('ıß'),unicodeCaseFold('iẞ'));
});

test('canonical equivalents receive the same full-fold key',()=>{
  assert.equal(unicodeCaseFold('café'),unicodeCaseFold('cafe\u0301'));
});
