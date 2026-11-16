'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {lowerPolyvariantAffine}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @returns {Promise<void>} */
async function main() {
  const input=path.join(__dirname,'original.cjs');
  const output=path.join(__dirname,'obfuscated.cjs');
  const original=await fs.readFile(input,'utf8');
  const result=lowerPolyvariantAffine(original,'commonjs',{
    seed:'polyvariant-sample-2026-11-16',names:['guardedTotal'],variants:2
  });
  assert.equal(result.functions,1);
  assert.equal(result.paths,2);
  if(process.argv.includes('--emit')) {
    process.stdout.write(result.code);
  } else if(process.argv.includes('--write')) {
    await atomicWrite(output,result.code);
    process.stdout.write('Wrote the deterministic generated sample\n');
  } else {
    assert.equal(await fs.readFile(output,'utf8'),result.code);
    process.stdout.write('Checked-in generated sample matches the compiler\n');
  }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
