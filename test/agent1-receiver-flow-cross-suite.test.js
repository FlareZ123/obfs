'use strict';

// Registers the receiver, member-flow, and adversarial regression suites in one
// focused Node test process so a single CI dispatch exercises the combined proof.
require('./agent5-receiver-bound-return-resolution.test.js');
require('./agent5-member-this-precision-review.test.js');
require('./agent6-member-flow-spread-override.test.js');
require('./agent10-member-flow-followup.test.js');
require('./agent10-class-field-captured-instance-runtime-witness.test.js');
require('./agent9-ambient-call-bindingid.test.js');
require('./agent1-agent5-lexical-receiver-independent-review.test.js');
require('./agent1-agent5-lexical-receiver-descriptor-review.test.js');
require('./agent1-agent5-function-expression-escape-review.test.js');
require('./agent1-agent5-arrow-container-precision.test.js');
