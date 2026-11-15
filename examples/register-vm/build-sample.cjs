'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {virtualizeRegisterChains}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const SEED='register-vm-example-v1';

/**
 * Rebuild the exact checked-in output with the compiler's register VM pass.
 * @param {boolean} check
 * @returns {Promise<void>}
 */
async function buildSample(check=false) {
  const input=await fs.readFile(path.join(__dirname,'before.cjs'),'utf8');
  const output=virtualizeRegisterChains(input,'commonjs',{seed:SEED,names:['mix']});
  assert.equal(output.functions,1);
  const destination=path.join(__dirname,'after.cjs');
  if(check)assert.equal(await fs.readFile(destination,'utf8'),output.code);
  else await atomicWrite(destination,output.code);
}

if(require.main===module) {
  buildSample(process.argv.includes('--check')).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={buildSample,SEED};
