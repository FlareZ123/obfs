'use strict';

const {test}=require('node:test');
const {main}=require('../sims/low-output-residual-common-basis-peercheck');

test('every 3-bit permutation has a common basis and width-4 samples satisfy the extension proof',main);
