'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {observe} = require('../sims/node-esm-module-frame-observation');

test('preloaded host callback can observe the active Node ESM module frame',async()=>{
  const native=await observe('privateField');
  const shortened=await observe('_p');

  assert.equal(native.result,7);
  assert.equal(shortened.result,7);
  assert.match(native.frame,/target\.mjs:1:\d+/);
  assert.match(shortened.frame,/target\.mjs:1:\d+/);
  assert.notEqual(native.column,shortened.column,
    'the module frame position must reflect a source-length change before the callback');
});
