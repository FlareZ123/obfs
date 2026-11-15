#!/usr/bin/env node
'use strict';

require('../src/cli').main('coo',process.argv.slice(2)).catch(error => {
  process.stderr.write(String(error?.stack ?? error) + '\n');
  process.exitCode=1;
});
