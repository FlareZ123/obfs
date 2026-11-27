'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {unicodeCaseFold}=require('../src/unicode-casefold');

test('Unicode 17.0 default full case folding handles expansions and symbols',()=>{
  assert.equal(unicodeCaseFold('ß'),'ss');
  assert.equal(unicodeCaseFold('ẞ'),'ss');
  assert.equal(unicodeCaseFold('ϑ'),'θ');
  assert.equal(unicodeCaseFold('ϴ'),'θ');
  assert.equal(unicodeCaseFold('ς'),'σ');
  assert.equal(unicodeCaseFold('ﬃ'),'ffi');
  assert.equal(unicodeCaseFold('և'),'եւ');
  assert.equal(unicodeCaseFold('ı'),'ı','Turkic-only mappings are excluded');
  assert.equal(unicodeCaseFold('İ'),'i\u0307');
  assert.equal(unicodeCaseFold('\u1C89'),'\u1C8A','Unicode 16 Cyrillic Tje mapping is included');
  assert.equal(unicodeCaseFold('K'),unicodeCaseFold('K'));
  assert.equal(unicodeCaseFold('ffi'),unicodeCaseFold('ﬃ'));
  assert.notEqual(unicodeCaseFold('e'),unicodeCaseFold('é'));
  assert.notEqual(unicodeCaseFold('A'),unicodeCaseFold('Ａ'));
  assert.notEqual(unicodeCaseFold('1'),unicodeCaseFold('①'));
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

test('Unicode 17.0 common/full table is complete and used by the fold function',()=>{
  const mappings=require('../src/unicode-casefold-data');
  assert.equal(Object.keys(mappings).length,1585);
  for(const [hex,expected] of Object.entries(mappings)) {
    const character=String.fromCodePoint(Number.parseInt(hex,16));
    assert.equal(unicodeCaseFold(character),expected.normalize('NFC'),hex);
  }
});
