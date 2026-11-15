'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {flattenBranchBlocks}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const ROOT=__dirname;
const SEED='branch-sample-2026-11-15';

/**
 * Regenerate the checked-in native-superblock VM demonstration.
 * @returns {Promise<string>}
 */
async function build(){
  const original=await fs.readFile(path.join(ROOT,'before','gate.cjs'),'utf8');
  const generated=flattenBranchBlocks(original,'commonjs',{seed:SEED,names:['gate']});
  assert.equal(generated.functions,1);
  assert.equal(generated.blocks,5);
  const target=path.join(ROOT,'after','gate.cjs');
  await atomicWrite(target,generated.code);
  const masked=flattenBranchBlocks(original,'commonjs',{
    seed:SEED,names:['gate'],stateBlinding:true
  });
  assert.equal(masked.functions,1);
  assert.equal(masked.blocks,5);
  await atomicWrite(path.join(ROOT,'after','gate-masked.cjs'),masked.code);
  return generated.code;
}

if(require.main===module) {
  build().then(async code=>{
    process.stdout.write('BEGIN_GENERATED_BRANCH_BLOCKS\n'+code+'\nEND_GENERATED_BRANCH_BLOCKS\n');
    const masked=await fs.readFile(path.join(ROOT,'after','gate-masked.cjs'),'utf8');
    process.stdout.write('BEGIN_GENERATED_MASKED_BRANCH_BLOCKS\n'+masked+'\nEND_GENERATED_MASKED_BRANCH_BLOCKS\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={build,SEED};
