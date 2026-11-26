'use strict';

// Focused review suite: conservative bound-target admission, host effects,
// source parity, ESM cross-file ownership, and the existing new.target guards.
require('./agent1-native-bind-call-target-shape.test.js');
require('./agent1-bound-target-crossfile-probe.test.js');
require('./agent1-newtarget-arrow-lexical-observer.test.js');
require('./agent1-newtarget-bound-source-observer.test.js');
require('./agent1-newtarget-exported-closure-observer.test.js');
require('./agent3-bound-constructor-target-extraction.test.js');
require('./agent3-constructible-bound-source-regression.test.js');
require('./agent3-native-bind-import-meta-host-getter.test.js');
