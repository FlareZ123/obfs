'use strict';

const {spawnSync}=require('node:child_process');
const path=require('node:path');

/**
 * Attacker receives only a public output directory and chosen input cases.
 * They execute the distributed program as an offline functional clone.
 * No original source, compiler, seed, or server is imported.
 * This is a baseline copy attack, not recovered high-level source.
 * @param {string} publicDirectory
 * @param {number[][]} cases
 * @returns {unknown[]}
 */
function copyAttack(publicDirectory,cases){
  const child=spawnSync(process.execPath,[
    path.join(publicDirectory,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:30000});
  if(child.error)throw child.error;
  if(child.status!==0)throw Error('Public clone failed: '+child.stderr);
  return JSON.parse(child.stdout);
}
module.exports={copyAttack};

if(require.main===module){
  const directory=process.argv[2];
  if(!directory)throw Error('Usage: node sims/application-challenge-offline-copy.js PUBLIC_DIRECTORY');
  const cases=[[0,100000],[1,100000],[4294967295,100000]];
  process.stdout.write(JSON.stringify({
    attackerInputs:'public output only',cases:cases.length,
    results:copyAttack(directory,cases)
  })+'\n');
}
