'use strict';

// Focused integration bundle for the WeakMap prototype/source-observer guard.
// Requiring each node:test module registers its tests in this single runner.
require('./agent10-weakmap-group-prototype-guard.test.js');
require('./agent10-weakmap-instance-flow-prototype-escape.test.js');
require('./agent10-weakmap-prototype-cross-file.test.js');
require('./agent10-weakmap-prototype-getter-aliases.test.js');
require('./agent10-weakmap-prototype-same-file.test.js');
require('./agent10-weakmap-prototype-yield-control.test.js');
require('./agent10-weakmap-shadowed-subclass-yield.test.js');
require('./agent10-weakmap-commonjs-export-escape.test.js');
require('./agent6-weakmap-subclass-base-prototype.test.js');
