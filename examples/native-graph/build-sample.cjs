'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {virtualizeExpressionGraphs}=require('../../src/expression-vm');
const {atomicWrite}=require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<void>} */
async function buildSample(check=false) {
  const source=(await fs.readFile(path.join(__dirname,'before.cjs'),'utf8'))
    .replace(/\r\n/gu,'\n');
  const optimized=virtualizeExpressionGraphs(source,'commonjs',{
    seed:'native-graph-example-v1',names:['mix'],backend:'native'
  });
  assert.equal(optimized.functions,1);
  assert.equal(optimized.instructions,6);
  const destination=path.join(__dirname,'after.cjs');
  if(check) {
    assert.equal((await fs.readFile(destination,'utf8')).replace(/\r\n/gu,'\n'),optimized.code);
  } else {
    await atomicWrite(destination,optimized.code);
  }
}

if(require.main===module)buildSample().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={buildSample};
