'use strict';

const {test}=require('node:test');
const {main}=require('../sims/common-basis-gf3-exhaustive');

test('all GF(3)^2 permutations admit common bases and singular inputs repair',main);
