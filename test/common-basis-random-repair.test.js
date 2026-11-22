'use strict';

const {test}=require('node:test');
const {main}=require('../sims/low-output-common-basis-repair');

test('randomized common-basis repair on all small permutations and 32-bit deficient involution',main);
