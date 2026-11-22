'use strict';

const {test}=require('node:test');
const {main}=require('../sims/common-basis-deterministic-hyperplane');

test('every deterministic basis proposal can have its oracle transcript hyperplane-completed',main);
