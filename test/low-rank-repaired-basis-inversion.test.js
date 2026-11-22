'use strict';

const {test}=require('node:test');
const {main}=require('../sims/low-rank-repaired-basis-inversion');

test('singular rank-one and rank-two 8-bit permutations invert every target after basis repair',main);
