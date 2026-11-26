'use strict';

// Focused review harness: existing bound-runtime acceptance tests plus
// the narrow prototype's positive and fail-closed controls.
require('./bound-runtime-interception.test.js');
require('./bound-runtime-minifier-control.test.js');
require('./source-stable-bound-export.test.js');
require('./pr379-bound-function-proof-prototype.test.js');
