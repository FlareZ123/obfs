'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

/**
 * Attacker-only functional clone. Uses the delivered files, a locally
 * emulated host callback and caller-provided inputs. It requires no original
 * source, build-time seed, obfuscator, private server or credentials.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const seed=Number(process.argv[2]??17)|0;
  const records=process.argv[3]?JSON.parse(process.argv[3]):[
    {kind:'open',payload:'A'},{kind:'tick',payload:'β'},
    {kind:'close',payload:'Z'}
  ];
  if(!Array.isArray(records))throw new TypeError('Expected JSON event array');
  const entry=path.join(__dirname,'../examples/polyvariant-app/generated/entry.mjs');
  const distributed=await import(pathToFileURL(entry).href);
  /** @type {unknown[]} */
  const intercept=[];
  const output=distributed.runScenario(seed,records,{
    emit(record){intercept.push(record);}
  });
  const result=JSON.parse(output);
  assert.deepEqual(intercept,result.trace);
  process.stdout.write(JSON.stringify({
    output,intercepted:intercept.length,
    source:'public generated app only'
  })+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
