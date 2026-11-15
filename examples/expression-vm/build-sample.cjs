'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {virtualizeExpressionGraphs} = require('../../src/expression-vm');
const {atomicWrite} = require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<void>} */
async function buildSample(check=false) {
  const root=__dirname;
  const source=(await fs.readFile(path.join(root,'before.cjs'),'utf8')).replace(/\r\n/gu,'\n');
  const result=virtualizeExpressionGraphs(source,'commonjs',{
    seed:'expression-vm-example-v1',names:['mix']
  });
  assert.equal(result.functions,1);
  assert.equal(result.instructions,6);
  const after=path.join(root,'after.cjs');
  if(check) {
    assert.equal((await fs.readFile(after,'utf8')).replace(/\r\n/gu,'\n'),result.code);
  } else {
    await atomicWrite(after,result.code);
  }
}

if(require.main===module)buildSample().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={buildSample};
