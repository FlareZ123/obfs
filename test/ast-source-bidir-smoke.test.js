'use strict';

// Isolated candidate-only aggregation. Run the original test modules in one
// focused CI process; do not ship this duplicate wrapper with the full suite.
require('./source-observer-islands-fuzz.test');
require('./source-observer-islands-host-argument.test');
require('./source-observer-islands-reflection-gate.test');
require('./source-observer-islands.test');
require('./source-observer-islands-backend-boundary.test');
require('./cross-file-boxed-primitive-host-pattern.test');
require('./cross-file-primitive-member-host-escape.test');
require('./cross-file-for-in-host-pattern-gate.test');
