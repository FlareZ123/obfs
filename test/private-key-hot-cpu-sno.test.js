'use strict';

// Exercise the same proven private-owner CPU budget under the server-executed
// SNO output mode, with all independent native and equal-trust controls.
process.env.OBFS_PRIVATE_KEY_MODE='sno';
require('./private-key-hot-cpu-control.test.js');
