'use strict';
const { build } = require('../lib/build');
try { console.log(JSON.stringify(build('sno', process.argv.slice(2)), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
