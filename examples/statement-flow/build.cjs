'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {flattenStatementFlow}=require('../../src/statement-flow');
const {atomicWrite}=require('../../src/atomic');

async function main() {
  const input=path.join(__dirname,'before','router.cjs');
  const output=path.join(__dirname,'after','router.cjs');
  const source=await fs.readFile(input,'utf8');
  const compiled=flattenStatementFlow(source,'commonjs',{
    seed:'statement-flow-example-20261116',names:['route']
  });
  assert.equal(compiled.functions,1);
  await atomicWrite(output,compiled.code);
  process.stdout.write('Generated '+compiled.functions+
    ' function, '+compiled.blocks+' CFG blocks\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
