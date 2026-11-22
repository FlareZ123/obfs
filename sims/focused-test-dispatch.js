'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * Limit manual workflow dispatch to one known test file in the repository.
 * User-supplied workflow inputs must never be interpolated into shell code.
 *
 * @param {unknown} requested
 * @returns {string}
 */
function selectedFocusedTest(requested) {
  if(typeof requested!=='string'||requested.length>192||
     !/^test\/[a-z0-9][a-z0-9._-]*\.test\.js$/u.test(requested)) {
    throw new TypeError('Focused test must be a single test/<name>.test.js path');
  }
  const absolute=path.resolve(process.cwd(),requested);
  if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile()) {
    throw new TypeError('Focused test file does not exist: '+requested);
  }
  return requested;
}

if(require.main===module) {
  const file=selectedFocusedTest(process.env.OBFS_FOCUSED_TEST);
  const child=spawnSync(process.execPath,['--test','--test-reporter=spec',file],{
    stdio:'inherit'
  });
  if(child.error)throw child.error;
  process.exitCode=child.status??1;
}

module.exports={selectedFocusedTest};
