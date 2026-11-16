'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {recover}=require('./polyvariant-affine-static-recover');

/**
 * Seedless static affine reconstruction from a published SNO .mjs file.
 * The static attack reads the public source only; execution of distributed
 * functions is performed afterward solely to verify held-out equivalence.
 * It imports neither the original source nor the obfuscator library.
 *
 * @param {string} publicDirectory
 * @returns {Promise<{functionNames:string[],recovered:number,pathsPerFunction:number,comparisons:number,offsets:number[]}>}
 */
async function runAttack(publicDirectory){
  const filename=path.join(publicDirectory,'math.mjs');
  const bytes=fs.readFileSync(filename,'utf8');
  const delivered=await import(pathToFileURL(filename).href);
  const names=['round1','round2','round3'];
  const offsets=[];
  let reconstructedCount=0,comparisons=0,pathsPerFunction=0;
  for(const name of names){
    const proof=recover(bytes,name,'module');
    const reconstructed=/** @type {(input:number)=>number} */(
      Function('return ('+proof.source+')')());
    assert.equal(proof.cases,2);
    pathsPerFunction=proof.cases;
    offsets.push(proof.offset);
    reconstructedCount++;
    const boundary=[-2147483648,-1,0,1,2147483647,0x12345678|0,-0];
    for(let index=0;index<4096;index++){
      const input=index<boundary.length?boundary[index]:
        Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
      assert.ok(Object.is(reconstructed(input),delivered[name](input)),
        'Source-only reconstruction differs at '+name+'/'+index);
      comparisons++;
    }
  }
  return {functionNames:names,recovered:reconstructedCount,
    pathsPerFunction,comparisons,offsets};
}

if(require.main===module){
  if(!process.argv[2]){
    process.stderr.write('Expected public SNO package directory\n');
    process.exitCode=1;
  }else{
    runAttack(path.resolve(process.argv[2])).then(output=>{
      process.stdout.write('SNO_POLYVARIANT_STATIC_ATTACK '+
        JSON.stringify(output)+'\n');
    }).catch(error=>{console.error(error);process.exitCode=1;});
  }
}

module.exports={runAttack};
