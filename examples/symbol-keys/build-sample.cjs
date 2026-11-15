'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('../../src/ast');
const {symbolizeLocalProperties}=require('../../src/symbol-properties');
const {atomicWrite}=require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<void>} */
async function buildSample(check=false) {
  const source=(await fs.readFile(path.join(__dirname,'before.cjs'),'utf8')).replace(/\r\n/gu,'\n');
  const result=symbolizeLocalProperties(source,parse(source,'commonjs'),{seed:'symbol-example-v1'});
  assert.equal(result.objects,1);
  assert.equal(result.properties,2);
  const destination=path.join(__dirname,'after.cjs');
  if(check)assert.equal((await fs.readFile(destination,'utf8')).replace(/\r\n/gu,'\n'),result.code);
  else await atomicWrite(destination,result.code);
}
if(require.main===module)buildSample().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={buildSample};
