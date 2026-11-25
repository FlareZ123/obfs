'use strict';

// Reuse the repository's broad receiver/member-flow cross-suite, then add the
// explicit call/apply/bind receiver suite and Agent 6's independent probes.
require('./agent1-receiver-flow-cross-suite.test.js');
require('./agent5-explicit-this-receiver-call-apply.test.js');
require('./agent6-receiver-instance-override.test.js');
