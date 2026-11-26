'use strict';

// Load the same-file refusal, unrelated-prototype precision, and cross-file
// group-refusal regressions into one focused cross-platform CI invocation.
require('./agent4-weakmap-prototype-escape.test.js');
require('./agent4-weakmap-prototype-guard-precision.test.js');
require('./agent4-weakmap-group-prototype-summary.test.js');
