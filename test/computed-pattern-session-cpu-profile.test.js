'use strict';

const {test}=require('node:test');
const {main}=require('../sims/computed-pattern-session-cpu-profile');

test('paired fresh ESM process and hot-loop CPU measurements',main);
