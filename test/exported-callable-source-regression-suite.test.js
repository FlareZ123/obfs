'use strict';

// Focused integration gate for exported-callable source compatibility.
require('./property-exported-callable-source-boundary.test.js');
require('./commonjs-public-callable-source.test.js');
require('./property-pure-expression-hotpath.test.js');
require('./clone-exported-alias-esm.test.js');
require('./clone-source-esm-graph.test.js');
require('./intl-cross-file-source.test.js');
require('./sco-interfile-source-observation.test.js');
require('./array-owner-flow.test.js');
require('./array-owner-grid.test.js');
require('./array-owner-interfile.test.js');
require('./imported-constant-computed-key.test.js');
require('./owned-constant-key-sample.test.js');
require('./primitive-coercer-sample.test.js');
