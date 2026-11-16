'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {normalizeDistributedFiles}=require('./attacker-token-normalize');

/**
 * Attacker-only process. Its sole application input is a directory of
 * published ESM files, with no originals, compiler, seed or server access.
 * The separate process loads only Node builtins, Acorn and the public-token
 * normalizer. This reconstructs neutral labels rather than erased names.
 *
 * @param {string} publicDirectory
 * @param {string} destination
 * @returns {{files:number,properties:number,variables:number,scanMs:number,bytes:number}}
 */
function runAttack(publicDirectory,destination){
  const names=fs.readdirSync(publicDirectory).filter(name=>name.endsWith('.mjs')).sort();
  assert.ok(names.includes('entry.mjs'),'Public entry is missing');
  const files=names.map(name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:fs.readFileSync(path.join(publicDirectory,name),'utf8')
  }));
  const start=performance.now();
  const result=normalizeDistributedFiles(files);
  const scanMs=performance.now()-start;
  let bytes=0;
  for(const file of result.files){
    const target=path.join(destination,file.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    // Unique output folders and exclusive temp creation prevent writer races.
    // Rename publishes a complete file atomically.
    const staged=target+'.stage';
    const descriptor=fs.openSync(staged,'wx');
    try{
      fs.writeFileSync(descriptor,file.code,'utf8');
    }finally{fs.closeSync(descriptor);}
    fs.renameSync(staged,target);
    bytes+=Buffer.byteLength(file.code);
  }
  return {files:result.files.length,properties:result.properties,
    variables:result.variables,scanMs,bytes};
}

if(require.main===module){
  const pub=process.argv[2],dest=process.argv[3];
  if(!pub||!dest)throw new Error('Usage: node application-challenge-token-neutralize-attacker.js PUBLIC_DIR OUTPUT_DIR');
  process.stdout.write(JSON.stringify(runAttack(pub,dest))+'\n');
}
module.exports={runAttack};
