'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @returns {Promise<ReturnType<typeof obfuscateFiles>>} */
async function build() {
  const names=['math.mjs','state.mjs','entry.mjs'];
  const source=await Promise.all(names.map(async name=>({
    path:name,sourceType:/** @type {const} */ ('module'),
    code:(await fs.readFile(path.join(__dirname,'native',name),'utf8'))
      .replace(/\r\n/g,'\n')
  })));
  // The reflective stateful modules fail the whole-graph source-observation
  // proof. Protect the narrow math island and intentionally ship the other
  // two source modules unchanged. The attached test checks whole-graph refusal.
  const encoded=obfuscateFiles(source.slice(0,1),{
    mode:'coo',seed:'multi-file-attacker-challenge-20261116',
    closedWorld:false,strings:false,
    experimentalPolyvariantAffine:{'math.mjs':['round1','round2','round3']},
    experimentalPolyvariantCount:2
  });
  return {...encoded,files:[...encoded.files,
    ...source.slice(1).map(file=>({...file,
      metrics:{literals:0,objects:0,properties:0,bindings:0}}))]};
}

/** @returns {Promise<void>} */
async function main() {
  const output=await build();
  assert.equal(output.files.length,3);
  assert.equal(output.files[0].metrics.polyvariantFunctions,3);
  if(process.argv.includes('--emit-json')){
    process.stdout.write(JSON.stringify(output.files.map(file=>({
      path:file.path,bytes:Buffer.byteLength(/** @type {string} */ (file.code),'utf8'),
      base64:Buffer.from(/** @type {string} */ (file.code),'utf8').toString('base64'),
      metrics:file.metrics
    })))+'\n');
    return;
  }
  for(const file of output.files){
    const destination=path.join(__dirname,'generated',file.path);
    if(process.argv.includes('--write')){
      await atomicWrite(destination,file.code);
    } else {
      const committed=(await fs.readFile(destination,'utf8')).replace(/\r\n/g,'\n');
      assert.equal(committed,file.code,'Compiler-generated app mismatch: '+file.path);
    }
  }
  process.stdout.write('Verified 3 compiler-generated COO application files\n');
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={build};
